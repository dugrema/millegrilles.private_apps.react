import React, { useState } from "react";
import ActionButton from "../resources/ActionButton";
import useWorkers from "../workers/workers";
import { TuuidsIdbStoreRowType } from "./idb/collections2Store.types";
import { encryptUploadDirect } from "./transferUtils";

export interface VideoSubtitlesProps {
  file: TuuidsIdbStoreRowType;
  // onUpload: (subtitle: { file: File; language: string }) => Promise<void>;
  // existing?: Array<{ id: string; language: string; filename: string }>;
}

function VideoSubtitles({ file }: VideoSubtitlesProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [language, setLanguage] = useState<string>("en");

  const fuuid = file.fileData?.fuuids_versions?.at(0);
  const existing = file.fileData?.web_subtitles;

  const workers = useWorkers();

  const handleDeleteSubtitle = async (
    e: React.MouseEvent<HTMLButtonElement>,
  ) => {
    if (!fuuid) throw new Error("File fuuid not provided");
    console.debug("Delete ", e.currentTarget.value);
    const subtitleFuuid = e.currentTarget.value;
    const response = await workers?.connection?.collection2RemovedWebSubtitle(
      fuuid,
      subtitleFuuid,
    );
    if (!response?.ok) {
      throw new Error(`Error removing subtitle: ${response?.err}`);
    }
  };

  const handleAddSubtitle = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!selectedFile || !workers) return;
    // await onUpload({ file: selectedFile, language });
    const fuuid = file.fileData?.fuuids_versions?.at(0),
      keyId = file.keyId;
    if (!fuuid) throw new Error("File id (fuuid) not available");
    if (!keyId) throw new Error("Key id not available");

    // Process subtitle: convert to vtt, compress using gzip, encrypt.
    const secretKey = file.secretKey;
    if (!secretKey) throw new Error("Secret key not provided");
    const fileUploadResult = await encryptUploadDirect(
      workers,
      selectedFile,
      secretKey,
    );
    console.debug("File upload result", fileUploadResult);

    const response = await workers?.connection.collection2AddWebSubtitle(
      fuuid,
      fileUploadResult.fuuid, // subtitleFuuid
      language,
      keyId, // cle_id,
      fileUploadResult.format,
      fileUploadResult.compression,
      fileUploadResult.nonce ?? undefined,
    );
    console.debug("Subtitle add response", response);

    // Reset form
    setSelectedFile(null);
    setLanguage("en");
  };

  return (
    <div>
      <h3>Upload Subtitle for {file.decryptedMetadata?.nom}</h3>
      <form onSubmit={(e) => e.preventDefault()}>
        <div>
          <label>
            Subtitle file:
            <input
              type="file"
              accept=".srt,.vtt,.sub"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setSelectedFile(e.target.files[0]);
                }
              }}
            />
          </label>
        </div>
        <div>
          <label>
            Language:
            <input
              type="text"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder="e.g. en, fr"
            />
          </label>
        </div>
        <ActionButton
          onClick={handleAddSubtitle}
          disabled={!selectedFile}
          revertSuccessTimeout={3}
          mainButton={false}
        >
          Add Subtitle
        </ActionButton>
      </form>

      {existing && existing.length > 0 && (
        <div>
          <h4>Existing Subtitles</h4>
          <ul>
            {existing.map((sub) => (
              <li key={sub.fuuid}>
                {sub.label ?? sub.language} ({sub.language})
                <ActionButton
                  onClick={handleDeleteSubtitle}
                  value={sub.fuuid}
                  confirm={true}
                >
                  Delete
                </ActionButton>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default VideoSubtitles;
