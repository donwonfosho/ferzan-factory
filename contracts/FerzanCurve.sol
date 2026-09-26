// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice One coin and its bonding curve. Fixed supply, no further mint.
///         1% trade fee: 60% treasury, 30% creator, 10% referrer (or treasury).
///         Fees are pulled with claim(). The buy that fills the curve opens a pool.
///         30% of the LP stays with the creator so they earn fees on that market.
///         The other 70% is burned. Curve sells stop after that.
contract FerzanCurve {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public immutable totalSupply;
    uint256 public immutable virtualEth;
    uint256 public immutable virtualToken;
    uint256 public immutable graduation;
    uint256 public immutable maxBuy;
    uint256 public immutable startAt;
    address public immutable creator;
    address public immutable treasury;
    address public immutable router;
    address public immutable wrapped;
    uint256 public immutable poolKind;
    address public pool;

    uint256 public realEth;
    uint256 public raisedEth;
    uint256 public tokensSold;
    bool public graduated;
    uint256 public feePlatform;
    uint256 public feeCreator;
    uint256 public feeReferrer;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => uint256) public claimable;
    mapping(address => uint256) public bought;

    uint256 private locked = 1;

    uint256 private constant FEE_BPS = 100;
    uint256 private constant PLATFORM_BPS = 6000;
    uint256 private constant CREATOR_BPS = 3000;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Trade(address indexed who, bool buy, uint256 ethAmount, uint256 tokenAmount, address referrer);
    event Graduated(uint256 raisedEth);
    event Pooled(address pool);

    address private constant DEAD = 0x000000000000000000000000000000000000dEaD;

    modifier nonReentrant() {
        require(locked == 1, "reentrancy");
        locked = 2;
        _;
        locked = 1;
    }

    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        uint256 supplyWhole,
        uint256 virtualNativeWei,
        uint256 virtualTokenWhole,
        uint256 graduationWei,
        uint256 maxBuyWei,
        uint256 delaySeconds,
        address creator_,
        address treasury_,
        address router_,
        address wrapped_,
        uint256 poolKind_
    ) payable {
        require(creator_ != address(0) && treasury_ != address(0), "addr");
        require(poolKind_ <= 3, "kind");
        if (poolKind_ > 0) require(router_ != address(0) && wrapped_ != address(0), "router");
        require(supplyWhole > 0 && virtualNativeWei > 0 && graduationWei > 0, "param");
        require(delaySeconds <= 7 days, "delay");
        name = tokenName;
        symbol = tokenSymbol;
        uint256 supply = supplyWhole * 1e18;
        uint256 depth = virtualTokenWhole == 0 ? (supply * 80) / 100 : virtualTokenWhole * 1e18;
        require(depth > 0 && depth <= supply, "depth");
        totalSupply = supply;
        virtualEth = virtualNativeWei;
        virtualToken = depth;
        graduation = graduationWei;
        maxBuy = maxBuyWei;
        startAt = block.timestamp + delaySeconds;
        creator = creator_;
        treasury = treasury_;
        router = router_;
        wrapped = wrapped_;
        poolKind = poolKind_;
        balanceOf[address(this)] = depth;
        emit Transfer(address(0), address(this), depth);
        if (supply > depth) {
            balanceOf[creator_] = supply - depth;
            emit Transfer(address(0), creator_, supply - depth);
        }
        if (msg.value > 0) {
            require(delaySeconds == 0, "delay");
            _buy(creator_, address(0), msg.value);
        }
    }

    function buy(address referrer) external payable nonReentrant {
        _buy(msg.sender, referrer, msg.value);
    }

    /// @notice Same buy, but the transaction reverts if the curve would pay fewer tokens.
    function buy(address referrer, uint256 minTokens) external payable nonReentrant {
        require(_buy(msg.sender, referrer, msg.value) >= minTokens, "slip");
    }

    function sell(uint256 tokenIn) external nonReentrant {
        _sell(tokenIn);
    }

    /// @notice Same sell, but the transaction reverts if the curve would pay less of the chain coin.
    function sell(uint256 tokenIn, uint256 minEth) external nonReentrant {
        require(_sell(tokenIn) >= minEth, "slip");
    }

    function claim() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        require(amount > 0, "nothing");
        claimable[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "claim");
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        return _transfer(msg.sender, to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
          require(allowed >= amount, "allowance");
          allowance[from][msg.sender] = allowed - amount;
        }
        return _transfer(from, to, amount);
    }

    /// @dev virtualEth, virtualToken, graduation, realEth, raisedEth, tokensSold, graduated, feePlatform, feeCreator, feeReferrer
    function state()
        external
        view
        returns (uint256, uint256, uint256, uint256, uint256, uint256, bool, uint256, uint256, uint256)
    {
        return (virtualEth, virtualToken, graduation, realEth, raisedEth, tokensSold, graduated, feePlatform, feeCreator, feeReferrer);
    }

    function _buy(address buyer, address referrer, uint256 ethIn) internal returns (uint256 tokensOut) {
        require(block.timestamp >= startAt, "early");
        require(!graduated, "graduated");
        require(ethIn > 0, "amount");
        if (maxBuy > 0) {
            require(bought[buyer] + ethIn <= maxBuy, "max");
            bought[buyer] += ethIn;
        }
        uint256 fee = (ethIn * FEE_BPS) / 10000;
        uint256 net = ethIn - fee;
        uint256 ethR = virtualEth + realEth;
        uint256 tokR = virtualToken - tokensSold;
        require(tokR > 0, "empty");
        uint256 newEth = ethR + net;
        uint256 newTok = (ethR * tokR) / newEth;
        require(tokR > newTok, "empty");
        tokensOut = tokR - newTok;
        require(balanceOf[address(this)] >= tokensOut, "reserve");

        tokensSold += tokensOut;
        realEth += net;
        raisedEth += net;
        _accrue(fee, referrer);
        balanceOf[address(this)] -= tokensOut;
        balanceOf[buyer] += tokensOut;
        emit Transfer(address(this), buyer, tokensOut);
        emit Trade(buyer, true, ethIn, tokensOut, referrer);

        if (realEth >= graduation) _openPool();
    }

    function _sell(uint256 tokenIn) internal returns (uint256 ethOut) {
        require(block.timestamp >= startAt, "early");
        require(pool == address(0), "pooled");
        require(tokenIn > 0, "amount");
        require(tokenIn <= tokensSold, "sold");
        require(balanceOf[msg.sender] >= tokenIn, "balance");

        uint256 ethR = virtualEth + realEth;
        uint256 tokR = virtualToken - tokensSold;
        uint256 newTok = tokR + tokenIn;
        uint256 newEth = (ethR * tokR) / newTok;
        require(ethR > newEth, "empty");
        uint256 gross = ethR - newEth;
        if (gross > realEth) gross = realEth;
        uint256 fee = (gross * FEE_BPS) / 10000;
        ethOut = gross - fee;

        tokensSold -= tokenIn;
        realEth -= gross;
        _accrue(fee, address(0));
        balanceOf[msg.sender] -= tokenIn;
        balanceOf[address(this)] += tokenIn;
        emit Transfer(msg.sender, address(this), tokenIn);
        emit Trade(msg.sender, false, ethOut, tokenIn, address(0));

        if (ethOut > 0) {
            (bool ok, ) = msg.sender.call{value: ethOut}("");
            require(ok, "pay");
        }
    }

    function _accrue(uint256 fee, address referrer) internal {
        if (fee == 0) return;
        uint256 platform = (fee * PLATFORM_BPS) / 10000;
        uint256 creatorFee = (fee * CREATOR_BPS) / 10000;
        uint256 ref = fee - platform - creatorFee;
        if (referrer == address(0)) {
            platform += ref;
            ref = 0;
        }
        feePlatform += platform;
        feeCreator += creatorFee;
        feeReferrer += ref;
        claimable[treasury] += platform;
        claimable[creator] += creatorFee;
        if (ref > 0) claimable[referrer] += ref;
    }

    function _transfer(address from, address to, uint256 amount) internal returns (bool) {
        require(to != address(0) && to != address(this), "to");
        uint256 bal = balanceOf[from];
        require(bal >= amount, "balance");
        unchecked {
            balanceOf[from] = bal - amount;
            balanceOf[to] += amount;
        }
        emit Transfer(from, to, amount);
        return true;
    }

    /// @dev The buy that crosses graduation sends the curve reserve and the remaining coins
    ///      into a new pool. The creator keeps 30% of the LP. The rest is burned.
    ///      If a pool was already opened by someone else, the curve reserve stays so holders can still sell.
    function _openPool() internal {
        graduated = true;
        if (poolKind == 0) {
            emit Graduated(raisedEth);
            return;
        }
        address existing = _findPool();
        if (existing != address(0) && _hasReserves(existing)) {
            emit Graduated(raisedEth);
            return;
        }
        uint256 ethIn = realEth;
        uint256 tokens = balanceOf[address(this)];
        if (ethIn == 0 || tokens == 0) {
            emit Graduated(raisedEth);
            return;
        }
        realEth = 0;
        allowance[address(this)][router] = tokens;
        if (poolKind == 1) {
            _addV2(ethIn, tokens);
        } else if (poolKind == 2) {
            _addAero(ethIn, tokens);
        } else {
            _addUsdc(ethIn, tokens);
        }
        pool = _findPool();
        require(pool != address(0), "pool");
        _shareLp(pool);
        emit Pooled(pool);
        emit Graduated(raisedEth);
    }

    function _addV2(uint256 ethIn, uint256 tokens) internal {
        (bool ok, ) = router.call{value: ethIn}(
            abi.encodeWithSelector(
                bytes4(keccak256("addLiquidityETH(address,uint256,uint256,uint256,address,uint256)")),
                address(this),
                tokens,
                tokens,
                ethIn,
                address(this),
                block.timestamp
            )
        );
        require(ok, "pool");
    }

    function _addAero(uint256 ethIn, uint256 tokens) internal {
        (bool ok, ) = wrapped.call{value: ethIn}(abi.encodeWithSelector(bytes4(keccak256("deposit()"))));
        require(ok, "wrap");
        (ok, ) = wrapped.call(abi.encodeWithSelector(bytes4(keccak256("approve(address,uint256)")), router, ethIn));
        require(ok, "approve");
        (ok, ) = router.call(
            abi.encodeWithSelector(
                bytes4(keccak256("addLiquidity(address,address,bool,uint256,uint256,uint256,uint256,address,uint256)")),
                address(this),
                wrapped,
                false,
                tokens,
                ethIn,
                tokens,
                ethIn,
                address(this),
                block.timestamp
            )
        );
        require(ok, "pool");
    }

    function _addUsdc(uint256 nativeIn, uint256 tokens) internal {
        uint256 quote = nativeIn / 1e12;
        require(quote > 0, "usdc");
        (bool ok, ) = wrapped.call(abi.encodeWithSelector(bytes4(keccak256("approve(address,uint256)")), router, quote));
        require(ok, "approve");
        (ok, ) = router.call(
            abi.encodeWithSelector(
                bytes4(keccak256("addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)")),
                address(this),
                wrapped,
                tokens,
                quote,
                tokens,
                quote,
                address(this),
                block.timestamp
            )
        );
        require(ok, "pool");
    }

    function _shareLp(address pair) internal {
        (bool ok, bytes memory data) = pair.staticcall(
            abi.encodeWithSelector(bytes4(keccak256("balanceOf(address)")), address(this))
        );
        require(ok && data.length >= 32, "lp");
        uint256 bal = abi.decode(data, (uint256));
        require(bal > 0, "lp");
        uint256 cut = (bal * CREATOR_BPS) / 10000;
        if (cut > 0) {
            (ok, ) = pair.call(abi.encodeWithSelector(bytes4(keccak256("transfer(address,uint256)")), creator, cut));
            require(ok, "creator lp");
        }
        uint256 rest = bal - cut;
        if (rest > 0) {
            (ok, ) = pair.call(abi.encodeWithSelector(bytes4(keccak256("transfer(address,uint256)")), DEAD, rest));
            require(ok, "burn");
        }
    }

    function _findPool() internal view returns (address found) {
        if (poolKind != 2) {
            (bool ok, bytes memory data) = router.staticcall(abi.encodeWithSelector(bytes4(keccak256("factory()"))));
            if (!ok || data.length < 32) return address(0);
            address factory = abi.decode(data, (address));
            (ok, data) = factory.staticcall(
                abi.encodeWithSelector(bytes4(keccak256("getPair(address,address)")), address(this), wrapped)
            );
            if (!ok || data.length < 32) return address(0);
            return abi.decode(data, (address));
        }
        (bool ok, bytes memory data) = router.staticcall(abi.encodeWithSelector(bytes4(keccak256("defaultFactory()"))));
        if (!ok || data.length < 32) return address(0);
        address factory = abi.decode(data, (address));
        (ok, data) = factory.staticcall(
            abi.encodeWithSelector(bytes4(keccak256("getPool(address,address,bool)")), address(this), wrapped, false)
        );
        if (!ok || data.length < 32) return address(0);
        return abi.decode(data, (address));
    }

    function _hasReserves(address pair) internal view returns (bool) {
        (bool ok, bytes memory data) = pair.staticcall(abi.encodeWithSelector(bytes4(keccak256("getReserves()"))));
        if (!ok || data.length < 64) return false;
        (uint256 reserve0, uint256 reserve1) = abi.decode(data, (uint256, uint256));
        return reserve0 > 0 && reserve1 > 0;
    }
}
