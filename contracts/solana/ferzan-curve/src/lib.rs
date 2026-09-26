//! Ferzan curve on Solana. One mint, one pool. 1% fee: 60% treasury, 30% creator, 10% referrer.
//! The buy that fills the curve stops new buys. A later migrate opens a Raydium pool and burns the LP.

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint,
    entrypoint::ProgramResult,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::Sysvar,
};

entrypoint!(process);
solana_program::declare_id!("G7n5XBB7pjvKS7JfC6esgQGGAyPku5cposdiHfVAUxnJ");

const TREASURY: Pubkey = solana_program::pubkey!("6yxsKcSeqAcoLXgyKDtVVW7Hb2d4uLYVT8X9zGa64HRp");
const TOKEN_PROGRAM: Pubkey = solana_program::pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ATA_PROGRAM: Pubkey = solana_program::pubkey!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const CPMM: Pubkey = solana_program::pubkey!("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C");
const CPMM_CONFIG: Pubkey = solana_program::pubkey!("D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2");
const CPMM_FEE: Pubkey = solana_program::pubkey!("DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8");
const WSOL: Pubkey = solana_program::pubkey!("So11111111111111111111111111111111111111112");
const RENT_SYSVAR: Pubkey = solana_program::pubkey!("SysvarRent111111111111111111111111111111111");

const STATE_LEN: usize = 172;
const MINT_LEN: u64 = 82;
const ERR_PARAM: u32 = 1;
const ERR_EARLY: u32 = 2;
const ERR_GRADUATED: u32 = 3;
const ERR_AMOUNT: u32 = 4;
const ERR_MAX: u32 = 5;
const ERR_EMPTY: u32 = 6;
const ERR_SLIP: u32 = 7;
const ERR_SOLD: u32 = 8;
const ERR_POOL: u32 = 9;

fn fail(code: u32) -> ProgramError {
    ProgramError::Custom(code)
}

fn process(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let (tag, rest) = data.split_first().ok_or(ProgramError::InvalidInstructionData)?;
    match tag {
        0 => init(program_id, accounts, rest),
        1 => buy(program_id, accounts, rest),
        2 => sell(program_id, accounts, rest),
        3 => migrate(program_id, accounts),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

fn init(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    if data.len() < 49 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let virtual_sol = read_u64(data, 0)?;
    let virtual_token = read_u64(data, 8)?;
    let graduation = read_u64(data, 16)?;
    let max_buy = read_u64(data, 24)?;
    let delay = read_i64(data, 32)?;
    let supply = read_u64(data, 40)?;
    let decimals = data[48];
    if virtual_sol == 0 || virtual_token == 0 || graduation == 0 || supply == 0 || decimals > 9 {
        return Err(fail(ERR_PARAM));
    }
    if virtual_token > supply || delay < 0 || delay > 7 * 24 * 60 * 60 {
        return Err(fail(ERR_PARAM));
    }

    let accounts = &mut accounts.iter();
    let payer = next_account_info(accounts)?;
    let curve = next_account_info(accounts)?;
    let mint = next_account_info(accounts)?;
    let vault = next_account_info(accounts)?;
    let creator_ata = next_account_info(accounts)?;
    let treasury = next_account_info(accounts)?;
    let token_program = next_account_info(accounts)?;
    let system_program = next_account_info(accounts)?;
    let ata_program = next_account_info(accounts)?;

    if !payer.is_signer || *treasury.key != TREASURY || *token_program.key != TOKEN_PROGRAM || *ata_program.key != ATA_PROGRAM {
        return Err(fail(ERR_PARAM));
    }
    if system_program.key != &solana_program::system_program::ID {
        return Err(fail(ERR_PARAM));
    }

    let (curve_key, bump) = Pubkey::find_program_address(&[b"curve", mint.key.as_ref()], program_id);
    if *curve.key != curve_key || *vault.key != ata_of(curve.key, mint.key) || *creator_ata.key != ata_of(payer.key, mint.key) {
        return Err(fail(ERR_PARAM));
    }

    let rent = Rent::get()?;
    let clock = Clock::get()?;
    let curve_rent = rent.minimum_balance(STATE_LEN);
    let mint_rent = rent.minimum_balance(MINT_LEN as usize);
    invoke_signed(
        &system_instruction::create_account(payer.key, curve.key, curve_rent, STATE_LEN as u64, program_id),
        &[payer.clone(), curve.clone(), system_program.clone()],
        &[&[b"curve", mint.key.as_ref(), &[bump]]],
    )?;
    invoke(
        &system_instruction::create_account(payer.key, mint.key, mint_rent, MINT_LEN, token_program.key),
        &[payer.clone(), mint.clone(), system_program.clone()],
    )?;
    invoke(
        &solana_program::instruction::Instruction {
            program_id: TOKEN_PROGRAM,
            accounts: vec![solana_program::instruction::AccountMeta::new(*mint.key, false)],
            data: {
                let mut data = vec![20, decimals];
                data.extend_from_slice(curve.key.as_ref());
                data.extend_from_slice(&[0, 0, 0, 0]);
                data
            },
        },
        &[mint.clone()],
    )?;
    create_ata(payer, vault, curve, mint, system_program, token_program, ata_program)?;
    create_ata(payer, creator_ata, payer, mint, system_program, token_program, ata_program)?;
    mint_to(mint, vault, curve, virtual_token, mint.key, bump)?;
    if supply > virtual_token {
        mint_to(mint, creator_ata, curve, supply - virtual_token, mint.key, bump)?;
    }
    set_mint_authority_none(mint, curve, mint.key, bump)?;

    let start_at = clock.unix_timestamp.saturating_add(delay);
    let mut raw = curve.try_borrow_mut_data()?;
    raw[0] = 1;
    raw[1..33].copy_from_slice(payer.key.as_ref());
    raw[33..65].copy_from_slice(TREASURY.as_ref());
    raw[65..97].copy_from_slice(mint.key.as_ref());
    write_u64(&mut raw, 97, virtual_sol);
    write_u64(&mut raw, 105, virtual_token);
    write_u64(&mut raw, 113, graduation);
    write_u64(&mut raw, 121, max_buy);
    write_i64(&mut raw, 129, start_at);
    write_u64(&mut raw, 164, curve_rent);
    raw[162] = bump;
    raw[163] = decimals;
    Ok(())
}

fn buy(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    if data.len() < 16 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let sol_in = read_u64(data, 0)?;
    let min_out = read_u64(data, 8)?;
    if sol_in == 0 {
        return Err(fail(ERR_AMOUNT));
    }
    let accounts = &mut accounts.iter();
    let buyer = next_account_info(accounts)?;
    let curve = next_account_info(accounts)?;
    let mint = next_account_info(accounts)?;
    let vault = next_account_info(accounts)?;
    let buyer_ata = next_account_info(accounts)?;
    let creator = next_account_info(accounts)?;
    let treasury = next_account_info(accounts)?;
    let referrer = next_account_info(accounts)?;
    let bought = next_account_info(accounts)?;
    let token_program = next_account_info(accounts)?;
    let system_program = next_account_info(accounts)?;
    if !buyer.is_signer || curve.owner != program_id || *token_program.key != TOKEN_PROGRAM {
        return Err(fail(ERR_PARAM));
    }
    let state = read_state(curve)?;
    if state.mint != *mint.key || state.treasury != *treasury.key || state.creator != *creator.key {
        return Err(fail(ERR_PARAM));
    }
    if *vault.key != ata_of(curve.key, mint.key) || *buyer_ata.key != ata_of(buyer.key, mint.key) {
        return Err(fail(ERR_PARAM));
    }
    let clock = Clock::get()?;
    if clock.unix_timestamp < state.start_at {
        return Err(fail(ERR_EARLY));
    }
    if state.graduated {
        return Err(fail(ERR_GRADUATED));
    }
    let (curve_key, _) = Pubkey::find_program_address(&[b"curve", mint.key.as_ref()], program_id);
    if *curve.key != curve_key {
        return Err(fail(ERR_PARAM));
    }

    if state.max_buy > 0 {
        let (bought_key, bought_bump) = Pubkey::find_program_address(&[b"bought", curve.key.as_ref(), buyer.key.as_ref()], program_id);
        if *bought.key != bought_key {
            return Err(fail(ERR_PARAM));
        }
        if bought.data_is_empty() {
            let rent = Rent::get()?.minimum_balance(8);
            invoke_signed(
                &system_instruction::create_account(buyer.key, bought.key, rent, 8, program_id),
                &[buyer.clone(), bought.clone(), system_program.clone()],
                &[&[b"bought", curve.key.as_ref(), buyer.key.as_ref(), &[bought_bump]]],
            )?;
        }
        let previous = read_u64(&bought.try_borrow_data()?, 0).unwrap_or(0);
        let next = previous.checked_add(sol_in).ok_or(fail(ERR_MAX))?;
        if next > state.max_buy {
            return Err(fail(ERR_MAX));
        }
        write_u64(&mut bought.try_borrow_mut_data()?, 0, next);
    }

    invoke(
        &system_instruction::transfer(buyer.key, curve.key, sol_in),
        &[buyer.clone(), curve.clone(), system_program.clone()],
    )?;

    let fee = (sol_in as u128).checked_mul(100).ok_or(fail(ERR_AMOUNT))? / 10_000;
    let fee = u64::try_from(fee).map_err(|_| fail(ERR_AMOUNT))?;
    let net = sol_in.checked_sub(fee).ok_or(fail(ERR_AMOUNT))?;
    let tokens = quote_buy(state.virtual_sol, state.real_sol, state.virtual_token, state.tokens_sold, net)?;
    if tokens < min_out {
        return Err(fail(ERR_SLIP));
    }
    split_fee(curve, treasury, creator, referrer, fee, true)?;
    token_transfer(vault, buyer_ata, curve, tokens, mint.key, state.bump)?;

    let mut raw = curve.try_borrow_mut_data()?;
    let real = read_u64(&raw, 137)?.checked_add(net).ok_or(fail(ERR_AMOUNT))?;
    let raised = read_u64(&raw, 145)?.checked_add(net).ok_or(fail(ERR_AMOUNT))?;
    let sold = read_u64(&raw, 153)?.checked_add(tokens).ok_or(fail(ERR_AMOUNT))?;
    write_u64(&mut raw, 137, real);
    write_u64(&mut raw, 145, raised);
    write_u64(&mut raw, 153, sold);
    if real >= state.graduation {
        raw[161] = 1;
    }
    Ok(())
}

fn sell(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    if data.len() < 16 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let token_in = read_u64(data, 0)?;
    let min_out = read_u64(data, 8)?;
    if token_in == 0 {
        return Err(fail(ERR_AMOUNT));
    }
    let accounts = &mut accounts.iter();
    let seller = next_account_info(accounts)?;
    let curve = next_account_info(accounts)?;
    let mint = next_account_info(accounts)?;
    let vault = next_account_info(accounts)?;
    let seller_ata = next_account_info(accounts)?;
    let creator = next_account_info(accounts)?;
    let treasury = next_account_info(accounts)?;
    let token_program = next_account_info(accounts)?;
    if !seller.is_signer || curve.owner != program_id || *token_program.key != TOKEN_PROGRAM {
        return Err(fail(ERR_PARAM));
    }
    let state = read_state(curve)?;
    if state.mint != *mint.key || state.creator != *creator.key || state.treasury != *treasury.key {
        return Err(fail(ERR_PARAM));
    }
    if *vault.key != ata_of(curve.key, mint.key) || *seller_ata.key != ata_of(seller.key, mint.key) {
        return Err(fail(ERR_PARAM));
    }
    let clock = Clock::get()?;
    if clock.unix_timestamp < state.start_at {
        return Err(fail(ERR_EARLY));
    }
    if state.pooled {
        return Err(fail(ERR_POOL));
    }
    if token_in > state.tokens_sold {
        return Err(fail(ERR_SOLD));
    }
    let (gross, sol_out, fee) = quote_sell(state.virtual_sol, state.real_sol, state.virtual_token, state.tokens_sold, token_in)?;
    if sol_out < min_out {
        return Err(fail(ERR_SLIP));
    }
    token_transfer_signed_by(seller, seller_ata, vault, token_in, token_program)?;
    split_fee(curve, treasury, creator, treasury, fee, false)?;
    move_lamports(curve, seller, sol_out)?;

    let mut raw = curve.try_borrow_mut_data()?;
    write_u64(&mut raw, 137, state.real_sol.checked_sub(gross).ok_or(fail(ERR_AMOUNT))?);
    write_u64(&mut raw, 153, state.tokens_sold.checked_sub(token_in).ok_or(fail(ERR_AMOUNT))?);
    Ok(())
}

fn migrate(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let accounts = &mut accounts.iter();
    let payer = next_account_info(accounts)?;
    let curve = next_account_info(accounts)?;
    let mint = next_account_info(accounts)?;
    let vault = next_account_info(accounts)?;
    let wsol_mint = next_account_info(accounts)?;
    let wsol_ata = next_account_info(accounts)?;
    let config = next_account_info(accounts)?;
    let authority = next_account_info(accounts)?;
    let pool = next_account_info(accounts)?;
    let token_0 = next_account_info(accounts)?;
    let token_1 = next_account_info(accounts)?;
    let lp_mint = next_account_info(accounts)?;
    let creator_0 = next_account_info(accounts)?;
    let creator_1 = next_account_info(accounts)?;
    let creator_lp = next_account_info(accounts)?;
    let vault_0 = next_account_info(accounts)?;
    let vault_1 = next_account_info(accounts)?;
    let fee_account = next_account_info(accounts)?;
    let observation = next_account_info(accounts)?;
    let token_program = next_account_info(accounts)?;
    let ata_program = next_account_info(accounts)?;
    let system_program = next_account_info(accounts)?;
    let rent = next_account_info(accounts)?;
    let creator_wallet = next_account_info(accounts)?;
    let owner_lp = next_account_info(accounts)?;
    if !payer.is_signer || curve.owner != program_id || *token_program.key != TOKEN_PROGRAM {
        return Err(fail(ERR_PARAM));
    }
    let state = read_state(curve)?;
    if state.mint != *mint.key || !state.graduated || state.pooled || state.real_sol == 0 {
        return Err(fail(ERR_POOL));
    }
    if *wsol_mint.key != WSOL || *config.key != CPMM_CONFIG || *fee_account.key != CPMM_FEE || *rent.key != RENT_SYSVAR {
        return Err(fail(ERR_PARAM));
    }
    if *vault.key != ata_of(curve.key, mint.key) || *wsol_ata.key != ata_of(curve.key, wsol_mint.key) {
        return Err(fail(ERR_PARAM));
    }
    let (token_0_key, token_1_key) = if mint.key < wsol_mint.key {
        (*mint.key, *wsol_mint.key)
    } else {
        (*wsol_mint.key, *mint.key)
    };
    let (pool_key, _) = Pubkey::find_program_address(&[b"pool", config.key.as_ref(), token_0_key.as_ref(), token_1_key.as_ref()], &CPMM);
    let (auth_key, _) = Pubkey::find_program_address(&[b"vault_and_lp_mint_auth_seed"], &CPMM);
    let (lp_key, _) = Pubkey::find_program_address(&[b"pool_lp_mint", pool_key.as_ref()], &CPMM);
    let (vault_0_key, _) = Pubkey::find_program_address(&[b"pool_vault", pool_key.as_ref(), token_0_key.as_ref()], &CPMM);
    let (vault_1_key, _) = Pubkey::find_program_address(&[b"pool_vault", pool_key.as_ref(), token_1_key.as_ref()], &CPMM);
    let (obs_key, _) = Pubkey::find_program_address(&[b"observation", pool_key.as_ref()], &CPMM);
    if *authority.key != auth_key || *pool.key != pool_key || *token_0.key != token_0_key || *token_1.key != token_1_key {
        return Err(fail(ERR_PARAM));
    }
    if *lp_mint.key != lp_key || *vault_0.key != vault_0_key || *vault_1.key != vault_1_key || *observation.key != obs_key {
        return Err(fail(ERR_PARAM));
    }
    if *creator_0.key != ata_of(curve.key, token_0.key) || *creator_1.key != ata_of(curve.key, token_1.key) || *creator_lp.key != ata_of(curve.key, lp_mint.key) {
        return Err(fail(ERR_PARAM));
    }
    if *creator_wallet.key != state.creator || *owner_lp.key != ata_of(creator_wallet.key, lp_mint.key) {
        return Err(fail(ERR_PARAM));
    }
    let (curve_key, _) = Pubkey::find_program_address(&[b"curve", mint.key.as_ref()], program_id);
    if *curve.key != curve_key {
        return Err(fail(ERR_PARAM));
    }
    invoke(
        &system_instruction::transfer(payer.key, curve.key, 500_000_000),
        &[payer.clone(), curve.clone(), system_program.clone()],
    )?;
    if wsol_ata.data_is_empty() {
        create_ata(payer, wsol_ata, curve, wsol_mint, system_program, token_program, ata_program)?;
    }
    move_lamports(curve, wsol_ata, state.real_sol)?;
    invoke_signed(
        &solana_program::instruction::Instruction {
            program_id: TOKEN_PROGRAM,
            accounts: vec![solana_program::instruction::AccountMeta::new(*wsol_ata.key, false)],
            data: vec![17],
        },
        &[wsol_ata.clone()],
        &[&[b"curve", mint.key.as_ref(), &[state.bump]]],
    )?;
    let coin_amount = token_amount(vault)?;
    let sol_amount = token_amount(wsol_ata)?;
    let (amount_0, amount_1) = if mint.key < wsol_mint.key {
        (coin_amount, sol_amount)
    } else {
        (sol_amount, coin_amount)
    };
    if amount_0 == 0 || amount_1 == 0 {
        return Err(fail(ERR_EMPTY));
    }
    let mut data = vec![175, 175, 109, 31, 13, 152, 155, 237];
    data.extend_from_slice(&amount_0.to_le_bytes());
    data.extend_from_slice(&amount_1.to_le_bytes());
    data.extend_from_slice(&0u64.to_le_bytes());
    let metas = vec![
        solana_program::instruction::AccountMeta::new(*curve.key, true),
        solana_program::instruction::AccountMeta::new_readonly(*config.key, false),
        solana_program::instruction::AccountMeta::new_readonly(*authority.key, false),
        solana_program::instruction::AccountMeta::new(*pool.key, false),
        solana_program::instruction::AccountMeta::new_readonly(*token_0.key, false),
        solana_program::instruction::AccountMeta::new_readonly(*token_1.key, false),
        solana_program::instruction::AccountMeta::new(*lp_mint.key, false),
        solana_program::instruction::AccountMeta::new(*creator_0.key, false),
        solana_program::instruction::AccountMeta::new(*creator_1.key, false),
        solana_program::instruction::AccountMeta::new(*creator_lp.key, false),
        solana_program::instruction::AccountMeta::new(*vault_0.key, false),
        solana_program::instruction::AccountMeta::new(*vault_1.key, false),
        solana_program::instruction::AccountMeta::new(*fee_account.key, false),
        solana_program::instruction::AccountMeta::new(*observation.key, false),
        solana_program::instruction::AccountMeta::new_readonly(*token_program.key, false),
        solana_program::instruction::AccountMeta::new_readonly(*token_program.key, false),
        solana_program::instruction::AccountMeta::new_readonly(*token_program.key, false),
        solana_program::instruction::AccountMeta::new_readonly(*ata_program.key, false),
        solana_program::instruction::AccountMeta::new_readonly(*system_program.key, false),
        solana_program::instruction::AccountMeta::new_readonly(*rent.key, false),
    ];
    invoke_signed(
        &solana_program::instruction::Instruction { program_id: CPMM, accounts: metas, data },
        &[
            curve.clone(),
            config.clone(),
            authority.clone(),
            pool.clone(),
            token_0.clone(),
            token_1.clone(),
            lp_mint.clone(),
            creator_0.clone(),
            creator_1.clone(),
            creator_lp.clone(),
            vault_0.clone(),
            vault_1.clone(),
            fee_account.clone(),
            observation.clone(),
            token_program.clone(),
            token_program.clone(),
            token_program.clone(),
            ata_program.clone(),
            system_program.clone(),
            rent.clone(),
        ],
        &[&[b"curve", mint.key.as_ref(), &[state.bump]]],
    )?;
    let lp_amount = token_amount(creator_lp)?;
    if lp_amount > 0 {
        if owner_lp.data_is_empty() {
            create_ata(payer, owner_lp, creator_wallet, lp_mint, system_program, token_program, ata_program)?;
        }
        let keep = (lp_amount as u128 * 3_000 / 10_000) as u64;
        let burned = lp_amount.checked_sub(keep).ok_or(fail(ERR_AMOUNT))?;
        if keep > 0 {
            token_transfer(creator_lp, owner_lp, curve, keep, mint.key, state.bump)?;
        }
        if burned > 0 {
            let mut burn = vec![8];
            burn.extend_from_slice(&burned.to_le_bytes());
            invoke_signed(
                &solana_program::instruction::Instruction {
                    program_id: TOKEN_PROGRAM,
                    accounts: vec![
                        solana_program::instruction::AccountMeta::new(*creator_lp.key, false),
                        solana_program::instruction::AccountMeta::new(*lp_mint.key, false),
                        solana_program::instruction::AccountMeta::new_readonly(*curve.key, true),
                    ],
                    data: burn,
                },
                &[creator_lp.clone(), lp_mint.clone(), curve.clone()],
                &[&[b"curve", mint.key.as_ref(), &[state.bump]]],
            )?;
        }
    }
    let mut raw = curve.try_borrow_mut_data()?;
    write_u64(&mut raw, 137, 0);
    raw[161] = 2;
    Ok(())
}

fn token_amount(account: &AccountInfo) -> Result<u64, ProgramError> {
    let data = account.try_borrow_data()?;
    read_u64(&data, 64)
}

struct State {
    creator: Pubkey,
    treasury: Pubkey,
    mint: Pubkey,
    virtual_sol: u64,
    virtual_token: u64,
    graduation: u64,
    max_buy: u64,
    start_at: i64,
    real_sol: u64,
    tokens_sold: u64,
    graduated: bool,
    pooled: bool,
    bump: u8,
}

fn read_state(curve: &AccountInfo) -> Result<State, ProgramError> {
    let raw = curve.try_borrow_data()?;
    if raw.len() < STATE_LEN || raw[0] != 1 {
        return Err(fail(ERR_PARAM));
    }
    Ok(State {
        creator: Pubkey::new_from_array(raw[1..33].try_into().unwrap()),
        treasury: Pubkey::new_from_array(raw[33..65].try_into().unwrap()),
        mint: Pubkey::new_from_array(raw[65..97].try_into().unwrap()),
        virtual_sol: read_u64(&raw, 97)?,
        virtual_token: read_u64(&raw, 105)?,
        graduation: read_u64(&raw, 113)?,
        max_buy: read_u64(&raw, 121)?,
        start_at: read_i64(&raw, 129)?,
        real_sol: read_u64(&raw, 137)?,
        tokens_sold: read_u64(&raw, 153)?,
        graduated: raw[161] != 0,
        pooled: raw[161] == 2,
        bump: raw[162],
    })
}

fn quote_buy(virtual_sol: u64, real_sol: u64, virtual_token: u64, tokens_sold: u64, net: u64) -> Result<u64, ProgramError> {
    let eth_r = (virtual_sol as u128).checked_add(real_sol as u128).ok_or(fail(ERR_EMPTY))?;
    let tok_r = (virtual_token as u128).checked_sub(tokens_sold as u128).ok_or(fail(ERR_EMPTY))?;
    if tok_r == 0 || net == 0 {
        return Err(fail(ERR_EMPTY));
    }
    let new_eth = eth_r.checked_add(net as u128).ok_or(fail(ERR_EMPTY))?;
    let new_tok = eth_r.checked_mul(tok_r).ok_or(fail(ERR_EMPTY))? / new_eth;
    if tok_r <= new_tok {
        return Err(fail(ERR_EMPTY));
    }
    u64::try_from(tok_r - new_tok).map_err(|_| fail(ERR_EMPTY))
}

fn quote_sell(virtual_sol: u64, real_sol: u64, virtual_token: u64, tokens_sold: u64, token_in: u64) -> Result<(u64, u64, u64), ProgramError> {
    let eth_r = (virtual_sol as u128).checked_add(real_sol as u128).ok_or(fail(ERR_EMPTY))?;
    let tok_r = (virtual_token as u128).checked_sub(tokens_sold as u128).ok_or(fail(ERR_EMPTY))?;
    let new_tok = tok_r.checked_add(token_in as u128).ok_or(fail(ERR_EMPTY))?;
    let new_eth = eth_r.checked_mul(tok_r).ok_or(fail(ERR_EMPTY))? / new_tok;
    if eth_r <= new_eth {
        return Err(fail(ERR_EMPTY));
    }
    let mut gross = u64::try_from(eth_r - new_eth).map_err(|_| fail(ERR_EMPTY))?;
    if gross > real_sol {
        gross = real_sol;
    }
    let fee = (gross as u128 * 100 / 10_000) as u64;
    let sol_out = gross.checked_sub(fee).ok_or(fail(ERR_AMOUNT))?;
    Ok((gross, sol_out, fee))
}

fn split_fee(curve: &AccountInfo, treasury: &AccountInfo, creator: &AccountInfo, referrer: &AccountInfo, fee: u64, pay_referrer: bool) -> ProgramResult {
    if fee == 0 {
        return Ok(());
    }
    let platform = (fee as u128 * 6_000 / 10_000) as u64;
    let creator_fee = (fee as u128 * 3_000 / 10_000) as u64;
    let mut referrer_fee = fee.checked_sub(platform).ok_or(fail(ERR_AMOUNT))?.checked_sub(creator_fee).ok_or(fail(ERR_AMOUNT))?;
    let mut platform = platform;
    if !pay_referrer || *referrer.key == *treasury.key {
        platform = platform.checked_add(referrer_fee).ok_or(fail(ERR_AMOUNT))?;
        referrer_fee = 0;
    }
    move_lamports(curve, treasury, platform)?;
    move_lamports(curve, creator, creator_fee)?;
    if referrer_fee > 0 {
        move_lamports(curve, referrer, referrer_fee)?;
    }
    Ok(())
}

fn move_lamports(from: &AccountInfo, to: &AccountInfo, amount: u64) -> ProgramResult {
    if amount == 0 {
        return Ok(());
    }
    if from.key == to.key {
        return Ok(());
    }
    **from.try_borrow_mut_lamports()? = from.lamports().checked_sub(amount).ok_or(ProgramError::InsufficientFunds)?;
    **to.try_borrow_mut_lamports()? = to.lamports().checked_add(amount).ok_or(fail(ERR_AMOUNT))?;
    Ok(())
}

fn mint_to<'a>(mint: &AccountInfo<'a>, dest: &AccountInfo<'a>, curve: &AccountInfo<'a>, amount: u64, mint_key: &Pubkey, bump: u8) -> ProgramResult {
    let mut data = vec![7];
    data.extend_from_slice(&amount.to_le_bytes());
    invoke_signed(
        &solana_program::instruction::Instruction {
            program_id: TOKEN_PROGRAM,
            accounts: vec![
                solana_program::instruction::AccountMeta::new(*mint.key, false),
                solana_program::instruction::AccountMeta::new(*dest.key, false),
                solana_program::instruction::AccountMeta::new_readonly(*curve.key, true),
            ],
            data,
        },
        &[mint.clone(), dest.clone(), curve.clone()],
        &[&[b"curve", mint_key.as_ref(), &[bump]]],
    )
}

fn set_mint_authority_none<'a>(mint: &AccountInfo<'a>, curve: &AccountInfo<'a>, mint_key: &Pubkey, bump: u8) -> ProgramResult {
    invoke_signed(
        &solana_program::instruction::Instruction {
            program_id: TOKEN_PROGRAM,
            accounts: vec![
                solana_program::instruction::AccountMeta::new(*mint.key, false),
                solana_program::instruction::AccountMeta::new_readonly(*curve.key, true),
            ],
            data: vec![6, 0, 0, 0, 0, 0],
        },
        &[mint.clone(), curve.clone()],
        &[&[b"curve", mint_key.as_ref(), &[bump]]],
    )
}

fn token_transfer<'a>(source: &AccountInfo<'a>, dest: &AccountInfo<'a>, curve: &AccountInfo<'a>, amount: u64, mint_key: &Pubkey, bump: u8) -> ProgramResult {
    let mut data = vec![3];
    data.extend_from_slice(&amount.to_le_bytes());
    invoke_signed(
        &solana_program::instruction::Instruction {
            program_id: TOKEN_PROGRAM,
            accounts: vec![
                solana_program::instruction::AccountMeta::new(*source.key, false),
                solana_program::instruction::AccountMeta::new(*dest.key, false),
                solana_program::instruction::AccountMeta::new_readonly(*curve.key, true),
            ],
            data,
        },
        &[source.clone(), dest.clone(), curve.clone()],
        &[&[b"curve", mint_key.as_ref(), &[bump]]],
    )
}

fn token_transfer_signed_by<'a>(
    owner: &AccountInfo<'a>,
    source: &AccountInfo<'a>,
    dest: &AccountInfo<'a>,
    amount: u64,
    token_program: &AccountInfo<'a>,
) -> ProgramResult {
    let mut data = vec![3];
    data.extend_from_slice(&amount.to_le_bytes());
    invoke(
        &solana_program::instruction::Instruction {
            program_id: TOKEN_PROGRAM,
            accounts: vec![
                solana_program::instruction::AccountMeta::new(*source.key, false),
                solana_program::instruction::AccountMeta::new(*dest.key, false),
                solana_program::instruction::AccountMeta::new_readonly(*owner.key, true),
            ],
            data,
        },
        &[source.clone(), dest.clone(), owner.clone(), token_program.clone()],
    )
}

fn create_ata<'a>(
    payer: &AccountInfo<'a>,
    ata: &AccountInfo<'a>,
    owner: &AccountInfo<'a>,
    mint: &AccountInfo<'a>,
    system_program: &AccountInfo<'a>,
    token_program: &AccountInfo<'a>,
    _ata_program: &AccountInfo<'a>,
) -> ProgramResult {
    invoke(
        &solana_program::instruction::Instruction {
            program_id: ATA_PROGRAM,
            accounts: vec![
                solana_program::instruction::AccountMeta::new(*payer.key, true),
                solana_program::instruction::AccountMeta::new(*ata.key, false),
                solana_program::instruction::AccountMeta::new_readonly(*owner.key, false),
                solana_program::instruction::AccountMeta::new_readonly(*mint.key, false),
                solana_program::instruction::AccountMeta::new_readonly(*system_program.key, false),
                solana_program::instruction::AccountMeta::new_readonly(*token_program.key, false),
            ],
            data: vec![1],
        },
        &[payer.clone(), ata.clone(), owner.clone(), mint.clone(), system_program.clone(), token_program.clone()],
    )
}

fn ata_of(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[owner.as_ref(), TOKEN_PROGRAM.as_ref(), mint.as_ref()], &ATA_PROGRAM).0
}

fn read_u64(data: &[u8], at: usize) -> Result<u64, ProgramError> {
    let bytes: [u8; 8] = data.get(at..at + 8).ok_or(ProgramError::InvalidInstructionData)?.try_into().unwrap();
    Ok(u64::from_le_bytes(bytes))
}

fn read_i64(data: &[u8], at: usize) -> Result<i64, ProgramError> {
    Ok(read_u64(data, at)? as i64)
}

fn write_u64(data: &mut [u8], at: usize, value: u64) {
    data[at..at + 8].copy_from_slice(&value.to_le_bytes());
}

fn write_i64(data: &mut [u8], at: usize, value: i64) {
    write_u64(data, at, value as u64);
}
