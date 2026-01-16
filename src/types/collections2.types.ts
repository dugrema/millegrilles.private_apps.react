export type AddWebSubtitleCommand = {
  file_fuuid: String;
  user_id: String;
  subtitle_fuuid: String;
  language: String;
  index?: number;
  label?: string;
  // Encryption parameters
  cle_id: String;
  format: String;
  compression?: string;
  nonce?: string;
};
