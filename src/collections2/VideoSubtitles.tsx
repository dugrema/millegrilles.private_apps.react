import React, { useState, useRef } from "react";
import ActionButton from "../resources/ActionButton";
import useWorkers, { AppWorkers } from "../workers/workers";
import { TuuidsIdbStoreRowType } from "./idb/collections2Store.types";
import { encryptUploadDirect } from "./transferUtils";

function ExistingSubtitles({
  workers,
  file,
  existing = [],
  onDelete,
}: {
  workers: AppWorkers | null;
  file: TuuidsIdbStoreRowType;
  existing: Array<{
    fuuid: string;
    language: string;
    label?: string;
  }>;
  onDelete: (fuuid: string) => Promise<void>;
}) {
  if (!workers || !existing || existing.length === 0) return null;

  const downloadSubtitle = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!existing) throw new Error("No existing subtitles");
    const subtitle = file.fileData?.web_subtitles
      ?.filter((item) => item.fuuid === e.currentTarget.value)
      .pop();
    if (!subtitle) throw new Error("No subtitle matches button");
    const secretKey = file.secretKey;
    if (!secretKey) throw new Error("SecretKey missing from file");

    const fuuid = subtitle.fuuid;
    const vttSubtitle: Blob = await workers?.directory.openFile(
      fuuid,
      secretKey,
      subtitle,
    );

    /* ---------- Download logic ---------- */
    const url = URL.createObjectURL(vttSubtitle);
    const a = document.createElement("a");
    a.href = url;
    const subtitleSubname = subtitle.label
      ? `${subtitle.label}.${subtitle.language}`
      : `${subtitle.language}`;
    const fileName = `${file.decryptedMetadata?.nom}.${subtitleSubname}.vtt`;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <h2 className="text-xl font-medium col-span-6 pt-3 pb-3">
        Existing Subtitles
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {existing.map((sub) => (
          <>
            <div>
              {sub.label ? `${sub.label} (${sub.language})` : sub.language}
            </div>
            <div>
              <ActionButton onClick={downloadSubtitle} value={sub.fuuid}>
                Download
              </ActionButton>
              <ActionButton onClick={() => onDelete(sub.fuuid)} confirm={true}>
                Delete
              </ActionButton>
            </div>
          </>
        ))}
      </div>
    </div>
  );
}

export interface VideoSubtitlesProps {
  file: TuuidsIdbStoreRowType;
  // onUpload: (subtitle: { file: File; language: string }) => Promise<void>;
  // existing?: Array<{ id: string; language: string; filename: string }>;
}

function VideoSubtitles({ file }: VideoSubtitlesProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [language, setLanguage] = useState<string>("en");
  const [label, setLabel] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag & drop helpers
  const triggerFileSelect = () => fileInputRef.current?.click();

  const isVttFile = (f: File) => {
    if (f.type === "text/vtt") return true;
    return f.name.toLowerCase().endsWith(".vtt");
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!isVttFile(file)) {
        alert("Only .vtt subtitle files are accepted.");
        return;
      }
      setSelectedFile(file);
    }
  };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (!isVttFile(file)) {
        alert("Only .vtt subtitle files are accepted.");
        return;
      }
      setSelectedFile(file);
    }
  };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    e.dataTransfer.effectAllowed = "copy";
  };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const fuuid = file.fileData?.fuuids_versions?.at(0);
  const existing = file.fileData?.web_subtitles;

  const workers = useWorkers();

  const handleDeleteSubtitle = async (subtitleFuuid: string) => {
    if (!fuuid) throw new Error("File fuuid not provided");
    console.debug("Delete ", subtitleFuuid);
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
    const fuuid = file.fileData?.fuuids_versions?.at(0),
      keyId = file.keyId;
    if (!fuuid) throw new Error("File id (fuuid) not available");
    if (!keyId) throw new Error("Key id not available");

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
      fileUploadResult.fuuid,
      language,
      keyId,
      fileUploadResult.format,
      fileUploadResult.compression,
      fileUploadResult.nonce ?? undefined,
      undefined,
      undefined,
      label ?? undefined,
    );
    console.debug("Subtitle add response", response);

    setSelectedFile(null);
    setLanguage("en");
  };

  return (
    <div>
      <ExistingSubtitles
        workers={workers}
        file={file}
        existing={existing ?? []}
        onDelete={handleDeleteSubtitle}
      />

      <form onSubmit={(e) => e.preventDefault()}>
        <h2 className="text-xl font-medium col-span-6 pt-3 pb-3">
          Add subtitle
        </h2>

        <div className="grid grid-cols-1 md:lg:grid-cols-3 xl:grid-cols-4 gap-2">
          <label className="flex flex-col">
            Language:
            <input
              type="text"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder="e.g. en, fr"
              className="text-black border rounded p-1"
            />
          </label>

          <label className="flex flex-col">
            Label (optional):
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Optional, e.g. English, Francais, etc."
              className="text-black border rounded p-1"
            />
          </label>

          <label className="flex flex-col">Subtitle file:</label>
          <div
            className="border-2 border-dashed border-gray-400 rounded p-4 text-center cursor-pointer hover:border-blue-500"
            onDrop={handleDrop}
            onDragEnter={handleDragOver}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={triggerFileSelect}
          >
            {selectedFile
              ? `Selected: ${selectedFile.name}`
              : "Drag & drop a VTT subtitle file here or click to browse"}
          </div>
          <input
            type="file"
            accept=".vtt"
            ref={fileInputRef}
            style={{ display: "none" }}
            onChange={handleFileSelect}
          />
        </div>

        <div className="pt-3">
          <ActionButton
            onClick={handleAddSubtitle}
            disabled={!selectedFile}
            revertSuccessTimeout={3}
            mainButton={false}
          >
            Add Subtitle
          </ActionButton>
        </div>
      </form>
    </div>
  );
}

export default VideoSubtitles;
