import {
  Collection2CreateDirectoryType,
  KeymasterSaveKeyCommand,
} from "../types/connection.types";
import { AppWorkers } from "../workers/workers";
import { messageStruct, multiencoding } from "millegrilles.cryptography";
import { TuuidEncryptedMetadata } from "./idb/collections2Store.types";

export async function createDirectory(
  workers: AppWorkers,
  name: string,
  parentCuuid: string | null,
): Promise<{
  command: Collection2CreateDirectoryType;
  key: messageStruct.MilleGrillesMessage;
}> {
  let entry = { nom: name };
  let entryJson = JSON.stringify(entry);
  let directoryMetadata = await workers.encryption.encryptMessageMgs4(
    entryJson,
    { domain: "GrosFichiers" },
  );

  let metadata = {
    data_chiffre: multiencoding.encodeBase64Nopad(directoryMetadata.ciphertext),
    cle_id: directoryMetadata.cle_id,
    nonce: multiencoding.encodeBase64Nopad(directoryMetadata.nonce),
    format: directoryMetadata.format,
    verification: directoryMetadata.digest
      ? multiencoding.hashEncode(
          "base58btc",
          "blake2b-512",
          directoryMetadata.digest,
        )
      : undefined,
    compression: directoryMetadata.compression,
  } as TuuidEncryptedMetadata;

  let command = {
    metadata,
    cuuid: parentCuuid,
    favoris: parentCuuid ? undefined : true, // Root entry if no cuuid
  } as Collection2CreateDirectoryType;

  let keyCommand = directoryMetadata.cle as KeymasterSaveKeyCommand;
  let signedKeyCommand = await workers.connection.createRoutedMessage(
    messageStruct.MessageKind.Command,
    keyCommand,
    { domaine: "MaitreDesCles", action: "ajouterCleDomaines" },
  );

  return { command, key: signedKeyCommand };
}

export async function updateEncryptedContent(
  workers: AppWorkers,
  cleId: string,
  secretKey: Uint8Array,
  newValues: Object,
) {
  let entryJson = JSON.stringify(newValues);
  let encryptedValues = await workers.encryption.encryptMessageMgs4(entryJson, {
    key: secretKey,
  });

  let metadata = {
    data_chiffre: multiencoding.encodeBase64Nopad(encryptedValues.ciphertext),
    cle_id: cleId,
    nonce: multiencoding.encodeBase64Nopad(encryptedValues.nonce),
    format: encryptedValues.format,
    verification: encryptedValues.digest
      ? multiencoding.hashEncode(
          "base58btc",
          "blake2b-512",
          encryptedValues.digest,
        )
      : undefined,
    compression: encryptedValues.compression,
  } as TuuidEncryptedMetadata;

  return metadata;
}
