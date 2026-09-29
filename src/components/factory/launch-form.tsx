import { OwnWalletLaunch } from "./own-wallet-launch";
import { Label } from "./ui";
import type { MarkChain } from "./chain-mark";
import type { Mode } from "@/lib/factory/types";

import { tr } from "@/lib/i18n";
/**
 * Launch page. Every launch goes through the Ferzan bots' factories (and Meteora on Solana)
 * with the visitor's own account wallet, so one flow covers every chain.
 * The props stay for the route's ?kind=&chain= links; the older site contracts are retired.
 */
export function LaunchForm(_props: { initialMode?: Mode; initialChain?: MarkChain }) {
  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-sm font-medium text-cyan">{tr("Curve")}</p>
      <h1 className="mt-2 text-4xl">{tr("Launch a coin")}</h1>
      <p className="mt-2 text-sm text-muted">
        {tr("Prefer Telegram?")}{" "}
        <a className="font-semibold text-cyan" href="https://t.me/Ferzan_Launch_Bot" target="_blank" rel="noopener noreferrer">
          {tr("Launch with @Ferzan_Launch_Bot")}
        </a>
        {tr(". Both land on the same board.")}
      </p>
      <OwnWalletLaunch />
    </div>
  );
}

export function ProjectPicture({
  image,
  onChange,
  onError,
}: {
  image: string;
  onChange: (next: string) => void;
  onError: (message: string) => void;
}) {
  function take(file: File | undefined) {
    if (!file) return;
    void readMark(file).then(
      (next) => {
        onChange(next);
        onError("");
      },
      (err: unknown) => onError(err instanceof Error ? err.message : tr("Could not read that picture.")),
    );
  }

  return (
    <div>
      <Label>{tr("Project picture")}</Label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label
          className="grid h-32 w-32 shrink-0 cursor-pointer place-items-center overflow-hidden bg-bg shadow-border"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            take(e.dataTransfer.files?.[0]);
          }}
        >
          {image ? (
            <img src={image} alt={tr("Project picture")} className="h-full w-full object-cover" />
          ) : (
            <span className="px-3 text-center text-xs font-semibold text-muted">{tr("Add a picture")}</span>
          )}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => {
              take(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <div className="text-sm text-muted">
          <p>{tr("PNG or JPG. People see this on the floor and on the coin page.")}</p>
          {image ? (
            <button type="button" className="mt-2 min-h-11 font-semibold text-cyan" onClick={() => onChange("")}>
              {tr("Remove picture")}
            </button>
          ) : (
            <p className="mt-2">{tr("Click the square or drop a file on it.")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function readMark(file: File): Promise<string> {
  const type = file.type || "";
  const name = file.name.toLowerCase();
  if (!type.startsWith("image/") && !/\.(png|jpe?g|webp)$/.test(name)) {
    return Promise.reject(new Error(tr("Use a PNG or JPG.")));
  }
  if (file.size > 12_000_000) return Promise.reject(new Error(tr("That picture is too large. Try one under 12 MB.")));
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error(tr("Could not read that picture.")));
        return;
      }
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      URL.revokeObjectURL(url);
      let quality = 0.82;
      let data = canvas.toDataURL("image/jpeg", quality);
      while (data.length > 180_000 && quality > 0.45) {
        quality -= 0.08;
        data = canvas.toDataURL("image/jpeg", quality);
      }
      if (!data.startsWith("data:image/") || data.length > 180_000) {
        reject(new Error(tr("That picture is still too heavy. Try a simpler image.")));
        return;
      }
      resolve(data);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(tr("Could not read that picture. Use a PNG or JPG.")));
    };
    img.src = url;
  });
}