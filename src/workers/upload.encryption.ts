import {
  digest,
  encryptionMgs4,
  messageStruct,
  multiencoding,
} from "millegrilles.cryptography";
import {
  getUploadJob,
  saveUploadJobAddCommand,
  saveUploadJobDecryptionInfo,
  saveUploadPart,
  TuuidEncryptedMetadata,
  updateUploadJobState,
  UploadIdbType,
  UploadStateEnum,
} from "../collections2/idb/collections2StoreIdb";
import { AppsEncryptionWorker } from "./encryption";
import { Collections2AddFileCommand } from "../types/connection.types";
import { THROTTLE_UPLOAD } from "./encryptionUtils";

const CONST_WORKER_ENCRYPTION_LOCK = "worker_encryption";

export type EncryptionWorkerCallbackType = (
  uploadId: number,
  userId: string,
  done: boolean,
  position?: number | null,
  size?: number | null,
  stateChanged?: boolean | null,
) => Promise<void>;

export type EncryptionWorkerJob = UploadIdbType & {
  file: File;
};

const CONST_CHUNK_SOFT_LIMIT = 1024 * 1024;

export class UploadEncryptionWorker {
  callback: EncryptionWorkerCallbackType | null;
  jobs: EncryptionWorkerJob[];
  running: boolean;
  intervalTrigger: any;
  appsEncryptionWorker: AppsEncryptionWorker; // Complete instance of the encryption worker class
  currentJob: EncryptionWorkerJob | null;
  jobCancelled: boolean;

  constructor() {
    this.callback = null;
    this.jobs = [];
    this.running = false;
    this.appsEncryptionWorker = new AppsEncryptionWorker();
    this.currentJob = null;
    this.jobCancelled = false;
  }

  async setup(callback: EncryptionWorkerCallbackType, caPem: string) {
    this.callback = callback;
    await this.appsEncryptionWorker.initialize(caPem);
    this.intervalTrigger = setInterval(() => {
      this.triggerJobs().catch((err) =>
        console.error("Error triggering encryption job from interval", err),
      );
    }, 20_000);
  }

  async setEncryptionKeys(pems: Array<string[]>) {
    await this.appsEncryptionWorker.setEncryptionKeys(pems);
  }

  async cancelJobIf(uploadId: number) {
    if (this.currentJob?.uploadId === uploadId) {
      this.jobCancelled = true;
    }
  }

  async isBusy() {
    if (!!this.currentJob) return true;

    // Use site level lock in the browser as second level check
    let busy = await navigator.locks.request(
      CONST_WORKER_ENCRYPTION_LOCK,
      { ifAvailable: true },
      async (lock) => {
        // console.debug("Lock check: %s, %O", lock?.name, lock?.mode);
        if (!lock) return true; // Busy
        return false;
      },
    );

    return busy;
  }

  async addJob(uploadId: number, file: File) {
    // Load job from IDB
    let uploadJob = (await getUploadJob(uploadId)) as UploadIdbType;
    if (!uploadJob) throw new Error("Unknown job id: " + uploadId);

    let job = { ...uploadJob, file } as EncryptionWorkerJob;

    // Push to job list
    this.jobs.push(job);

    await this.triggerJobs();
  }

  async triggerJobs() {
    if (!this.running) {
      // Trigger jobs
      this.processJobs().catch((err) =>
        console.error("Error processing jobs", err),
      );
    }
  }

  async processJobs() {
    await navigator.locks.request(
      CONST_WORKER_ENCRYPTION_LOCK,
      { ifAvailable: true },
      async (lock) => {
        // console.debug("Lock check before job: %s, %O", lock?.name, lock?.mode);
        if (!lock) throw new Error("Busy"); // Busy

        // Run the job, the lock is exclusive and will prevent dedicated workers in other tables from processing.
        await this._processJobs();
      },
    );
  }

  async _processJobs() {
    this.running = true;
    try {
      while (true) {
        let job = this.jobs.shift();
        if (!job) break;
        this.currentJob = job;
        this.jobCancelled = false;
        try {
          await this.encryptContent(job);
        } catch (err) {
          console.error("Error processing encryption job %O: %O", job, err);
          await updateUploadJobState(job.uploadId, UploadStateEnum.ERROR);
          if (this.callback) {
            await this.callback(job.uploadId, job.userId, true);
          }
        }
      }
    } finally {
      // Reset flags
      this.running = false;
      this.currentJob = null;
      this.jobCancelled = false;
    }
  }

  async encryptContent(uploadJob: EncryptionWorkerJob) {
    if (!uploadJob.file) throw new Error("No file to encrypt");

    let callback = this.callback;
    if (!callback) throw new Error("Callback not wired");

    // Update status
    await updateUploadJobState(uploadJob.uploadId, UploadStateEnum.ENCRYPTING);
    await callback(
      uploadJob.uploadId,
      uploadJob.userId,
      false,
      0,
      uploadJob.clearSize,
      true,
    );

    // Regularly send progress events
    let encryptedPosition = 0;
    let fileSize = uploadJob.file.size;
    let interval = setInterval(() => {
      if (callback && fileSize) {
        callback(
          uploadJob.uploadId,
          uploadJob.userId,
          false,
          encryptedPosition,
          fileSize,
        );
      }
    }, 750);

    try {
      let position = 0;
      let partSize = suggestPartSize(fileSize);

      // Encrypt file
      // let stream = uploadJob.file.stream();
      // var reader = stream.getReader();

      // iOS fails hard on .stream() for large files (tries to load all in memory)
      // use this slow hack
      let reader = sliceReader(uploadJob.file) as any;

      // let reader = stream.getReader();
      const iterReader = streamAsyncReaderIterable(reader);

      let key = uploadJob.secret?.secret;
      if (!key) throw new Error("Secret key not generated");

      let hasher = new digest.WrappedHasher("base64", "blake2s-256");
      await hasher.init();

      let cipher = await encryptionMgs4.getMgs4CipherWithSecret(key);

      // Buffer with chunks and blobs.
      let chunks = [] as Uint8Array[];
      let chunksSize = 0;
      let blobs = [] as Blob[]; // List of blobs to include in the current part
      let blobsSize = 0; // Current part size
      for await (let chunk of iterReader) {
        encryptedPosition += chunk.length;
        if (this.jobCancelled) {
          // Job has been cancelled. Done here and go pick up next job. Cleanup is not this worker's responsibility.
          callback(uploadJob.uploadId, uploadJob.userId, true);
          return;
        }

        hasher.update(chunk as any); // Hash of the original decrypted content

        let ciphertext = await cipher.update(chunk as any);
        if (ciphertext) {
          chunks.push(ciphertext);
          chunksSize += ciphertext.length;
        }

        if (chunksSize > CONST_CHUNK_SOFT_LIMIT) {
          // Offload chunks to blob
          let partBlob = new Blob(chunks);
          blobs.push(partBlob);
          blobsSize += partBlob.size;

          // Reset chunks
          chunksSize = 0;
          chunks = [];
        }

        if (blobsSize > partSize) {
          // Save blob to IDB
          let blob = new Blob(blobs);
          await saveUploadPart(uploadJob.uploadId, position, blob);

          if (THROTTLE_UPLOAD)
            await new Promise((resolve) =>
              setTimeout(resolve, THROTTLE_UPLOAD),
            ); // Throttle

          // Update position for next part
          position += blob.size;

          // Reset blobs
          blobs = [];
          blobsSize = 0;
        }
      }

      let originalDigest = hasher.finalize();
      let finalize = await cipher.finalize();
      if (finalize) {
        chunks.push(finalize);
      }

      if (chunks.length > 0) {
        // Add chunks to remaining blobs
        blobs.push(new Blob(chunks));
      }

      if (blobs.length > 0) {
        // Save blob to IDB
        let blob = new Blob(blobs);
        await saveUploadPart(uploadJob.uploadId, position, blob);
        position += blob.size;
      }

      // Save key and other encryption info to IDB
      let encryptionInfo = {
        cle_id: uploadJob.secret?.cle_id,
        format: "mgs4",
        nonce: multiencoding.encodeBase64Nopad(cipher.header),
      } as messageStruct.MessageDecryption;
      if (cipher.digest) {
        encryptionInfo.verification = multiencoding.hashEncode(
          "base58btc",
          "blake2b-512",
          cipher.digest,
        );
      }

      await saveUploadJobDecryptionInfo(
        uploadJob.uploadId,
        encryptionInfo,
        position,
        originalDigest,
      );
      await this.prepareFileAddMetadata(uploadJob.uploadId);

      // Trigger next step
      await callback(
        uploadJob.uploadId,
        uploadJob.userId,
        true,
        encryptedPosition,
        encryptedPosition,
        true,
      );
    } catch (err) {
      await updateUploadJobState(uploadJob.uploadId, UploadStateEnum.ERROR);
      await callback(
        uploadJob.uploadId,
        uploadJob.userId,
        true,
        null,
        null,
        true,
      );
      throw err;
    } finally {
      clearInterval(interval);
    }
  }

  async prepareFileAddMetadata(uploadId: number) {
    let uploadJob = (await getUploadJob(uploadId)) as UploadIdbType;
    if (!uploadJob) throw new Error("Unknown upload Id: " + uploadId);
    if (!uploadJob.secret)
      throw new Error("Upload without secret key: " + uploadId);
    let mimetype = uploadJob.mimetype;
    if (!mimetype) throw new Error("Mimetype not provided");

    let decryptedMetadata = {
      nom: uploadJob.filename,
      dateFichier: Math.floor(uploadJob.lastModified / 1000),
      hachage_original: uploadJob.originalDigest,
      originalSize: uploadJob.clearSize,
    };

    let encryptedMetadata =
      await this.appsEncryptionWorker.encryptMessageMgs4ToBase64(
        decryptedMetadata,
        uploadJob.secret.secret,
      );
    let metadata = {
      data_chiffre: encryptedMetadata.ciphertext_base64,
      cle_id: uploadJob.secret.cle_id,
      nonce: encryptedMetadata.nonce,
      format: encryptedMetadata.format,
    } as TuuidEncryptedMetadata;
    if (encryptedMetadata.compression)
      metadata.compression = encryptedMetadata.compression;

    let command = {
      fuuid: uploadJob.fuuid,
      cuuid: uploadJob.cuuid,
      mimetype,
      metadata,
      taille: uploadJob.size,
      cle_id: uploadJob.decryption?.cle_id,
      format: uploadJob.decryption?.format,
      nonce: uploadJob.decryption?.nonce,
    } as Collections2AddFileCommand;

    await saveUploadJobAddCommand(uploadJob.uploadId, command);
  }
}

const CONST_SIZE_1MB = 1024 * 1024;
const CONST_SIZE_1GB = 1024 * 1024 * 1024;

function suggestPartSize(fileSize: number | null) {
  if (!fileSize) {
    // Unknown file size. Default to 1MB parts.
    return CONST_SIZE_1MB;
  }

  if (fileSize < 50 * CONST_SIZE_1MB) {
    // 50MB
    return CONST_SIZE_1MB;
  } else if (fileSize < CONST_SIZE_1GB) {
    // 1GB
    // Recommend parts of 4% of the file size.
    return Math.floor(fileSize / 25); // part up to 40 MB
  } else {
    // For anything over 1GB, clamp to 50MB per part (the upload temporarily puts it in RAM before moving it to a blob)
    return 50 * CONST_SIZE_1MB;
  }
  // } else if(fileSize < 10 * CONST_SIZE_1GB){  // 10GB
  //     // Recommend parts of 1% of the file size.
  //     return Math.floor(fileSize / 100);
  // } else {                                    // >10GB
  //     // For anything over 10 GB, clamp to 100MB per part
  //     return 100 * CONST_SIZE_1MB;
  // }
}

/**
 * Transform reader to async iterable (for await ... of). Works on all current browsers.
 * Note : Chromium on PC and Firefox can already use stream() as async iterable.
 * @param {*} reader
 */
export async function* streamAsyncReaderIterable(reader: ReadableStream) {
  try {
    while (true) {
      // @ts-ignore
      const result = await reader.read();
      if (result.value) yield result.value; // Yield
      if (result.done) return; // Done
    }
  } finally {
    // @ts-ignore
    reader.releaseLock();
  }
}

/** Simulated reader using blob.slice. Used instead of File.stream() on iOS. */
export function sliceReader(file: File, opts?: { bufferSize?: number }) {
  const bufferSize = opts?.bufferSize || 64 * 1024; // 64 kB by default

  var position = 0;
  var done = false;
  const read = async (len: number) => {
    let bufferInner = len || bufferSize;

    // console.debug("sliceReader Read invoque, position %d, done %s", position, done)
    done = position === file.size;
    if (done) return { done, value: null };

    let positionEnd = Math.min(position + bufferInner, file.size);
    let blob = file.slice(position, positionEnd);
    let arrayBuffer = new Uint8Array(await blob.arrayBuffer());

    // Prepare next iteration
    position = positionEnd;
    return { done: false, value: arrayBuffer };
  };
  const releaseLock = () => {
    return;
  };

  return { read, releaseLock };
}
