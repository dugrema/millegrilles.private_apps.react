import { useState } from "react";
import { TuuidsIdbStoreRowType } from "./idb/collections2Store.types";

export interface VideoSubtitlesProps {
  file: TuuidsIdbStoreRowType;
  onUpload: (subtitle: { file: File; language: string }) => Promise<void>;
  existing?: Array<{ id: string; language: string; filename: string }>;
}

function VideoSubtitles(props: { file: TuuidsIdbStoreRowType }) {
  return <>TODO</>;
}

export default VideoSubtitles;
