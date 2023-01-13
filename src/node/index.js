import fetch from "isomorphic-fetch";
import { HttpAgent } from "@dfinity/agent";
import { canisterId, createActor } from "../declarations/nft/index.js";
import { identity } from "./identity.js";
import { createRequire } from "node:module";
import path from "path";
import fs from "fs";
import mmm from "mmmagic";
import { fileURLToPath } from "url";
import sha256File from "sha256-file";
import { Blob } from "buffer";
import { AssetManager } from "@dfinity/assets";
import imageThumbnail from "image-thumbnail";
import prettier from "prettier";

const require = createRequire(import.meta.url);
const nftConfig = require("./nfts.json");
const localCanisterIds = require("../../.dfx/local/canister_ids.json");

const encoder = new TextEncoder();

const agent = new HttpAgent({
  identity: await identity,
  host: "http://127.0.0.1:4943",
  fetch,
});
const effectiveCanisterId =
  canisterId?.toString() ?? localCanisterIds.nft.local;
const assetCanisterId = localCanisterIds.assets.local;
const actor = createActor(effectiveCanisterId, {
  agent,
});
const assetManager = new AssetManager({
  canisterId: assetCanisterId,
  agent,
  concurrency: 32, // Optional (default: 32), max concurrent requests.
  maxSingleFileSize: 450000, // Optional bytes (default: 450000), larger files will be uploaded as chunks.
  maxChunkSize: 1900000, // Optional bytes (default: 1900000), size of chunks when file is uploaded as chunks.
});

async function main() {
  nftConfig.forEach(async (nft, idx) => {
    console.log("starting upload for " + nft.asset);

    // Parse metadata, if present
    const metadata = Object.entries(nft.metadata ?? []).map(([key, value]) => {
      return [key, { TextContent: value }];
    });

    const filePath = path.join(
      fileURLToPath(import.meta.url),
      "..",
      "assets",
      nft.asset
    );

    const file = fs.readFileSync(filePath);

    const sha = sha256File(filePath);
    const options = {
      width: 256,
      height: 256,
      responseType: "buffer",
      jpegOptions: { force: true, quality: 90 },
    };
    console.log("generating thumbnail");
    const thumbnail = await imageThumbnail(filePath, options);

    const magic = await new mmm.Magic(mmm.MAGIC_MIME_TYPE);
    const contentType = await new Promise((resolve, reject) => {
      magic.detectFile(filePath, (err, result) => {
        if (err) reject(err);
        resolve(result);
      });
    });
    console.log("detected contenttype of ", contentType);

    /**
     * For asset in nfts.json
     *
     * Take asset
     * Check extenstion / mimetype
     * Sha content
     * Generate thumbnail
     * Upload both to asset canister -> file paths
     * Generate metadata from key / value
     * Mint ^
     */

    const uploadedFilePath = `token/${idx}${path.extname(nft.asset)}`;
    const uploadedThumbnailPath = `thumbnail/${idx}.jpeg`;

    console.log("uploading asset to ", uploadedFilePath);
    await assetManager.store(file, { fileName: uploadedFilePath });
    console.log("uploading thumbnail to ", uploadedThumbnailPath);
    await assetManager.store(thumbnail, { fileName: uploadedThumbnailPath });

    const principal = await (await identity).getPrincipal();

    const data = [
      [
        "location",
        {
          TextContent: `http://${assetCanisterId}.localhost:4943/${uploadedFilePath}`,
        },
      ],
      [
        "thumbnail",
        {
          TextContent: `http://${assetCanisterId}.localhost:4943/${uploadedThumbnailPath}`,
        },
      ],
      ["contentType", { TextContent: contentType }],
      ["contentHash", { BlobContent: encoder.encode(sha) }],
      ...metadata,
    ];
    const mintResult = await actor.dip721_mint(principal, BigInt(idx), data);
    console.log("result: ", mintResult);
    const metaResult = await actor.tokenMetadata(0n);
    console.log("new token info: ", metaResult);
    console.log(
      "token metadata: ",
      prettier.format(
        JSON.stringify(metaResult, (key, value) =>
          typeof value === "bigint" ? value.toString() : value
        ),
        { parser: "json" }
      )
    );
  });
}
main();
