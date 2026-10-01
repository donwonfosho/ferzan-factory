import { BOT_LAUNCH_CHAINS, LAUNCH_CHAIN_META } from "@/lib/factory/bot-launch";
import { BRIDGE_FEE_BPS } from "@/lib/factory/bridge-buy";
import { FEE } from "./launch-preview";

import { tr } from "@/lib/i18n";
/** Every fee in one place: what a trade, a launch and a bridge-and-buy cost. */
export function FeeTable() {
  return (
    <section className="mt-10">
      <h2 className="text-2xl">{tr("What it costs")}</h2>
      <p className="mt-1 max-w-xl text-sm text-muted">{tr("No subscription. Your wallet always shows the exact amount before you sign.")}</p>
      <dl className="ticket mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[14rem_1fr]">
        <dt className="text-muted">{tr("Trading on a Ferzan curve")}</dt>
        <dd>{tr("1% per trade. Half goes to the coin's creator and half to Ferzan, or 40% to Ferzan and 10% to a referrer.")}</dd>
        <dt className="text-muted">{tr("Bridge and buy")}</dt>
        <dd>{tr("{0}% Ferzan fee, shown in the quote.", String(BRIDGE_FEE_BPS / 100))}</dd>
        <dt className="text-muted">{tr("FERZAN launch")}</dt>
        <dd>{tr("The fee starts at 99% and falls to 1% over the first 30 minutes.")}</dd>
      </dl>
      <h3 className="mt-6 text-lg font-semibold">{tr("Launch fee by chain")}</h3>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[22rem] text-left text-sm">
          <thead>
            <tr className="text-muted">
              <th className="py-2 pr-4 font-medium">{tr("Chain")}</th>
              <th className="py-2 pr-4 font-medium">{tr("Ferzan launch fee")}</th>
              <th className="py-2 font-medium">{tr("Network cost")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {BOT_LAUNCH_CHAINS.map((id) => (
              <tr key={id}>
                <td className="py-2 pr-4 font-semibold">{LAUNCH_CHAIN_META[id].label}</td>
                <td className="py-2 pr-4 tabular-nums">{tr(FEE[id].fee)}</td>
                <td className="py-2 text-muted">{tr(FEE[id].extra)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
