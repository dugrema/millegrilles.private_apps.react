// https://en.wikipedia.org/wiki/Display_resolution
// Televisions are of the following resolutions:
// Standard-definition television (SDTV):
//   480i (NTSC-compatible digital standard employing two interlaced fields of 240 lines each)
//   576i (PAL-compatible digital standard employing two interlaced fields of 288 lines each)
// Enhanced-definition television (EDTV):
//   480p (720 × 480 progressive scan)
//   576p (720 × 576 progressive scan)
// High-definition television (HDTV):
//   720p (1280 × 720 progressive scan)
//   1080i (1920 × 1080 split into two interlaced fields of 540 lines)
//   1080p (1920 × 1080 progressive scan)
// Ultra-high-definition television (UHDTV):
//   4K UHD (3840 × 2160 progressive scan)
//   8K UHD (7680 × 4320 progressive scan)

export type ResolutionOption = {label: string, value: number};

export const VIDEO_RESOLUTIONS = [
    {label: '8k', value: 4320},
    {label: '4k', value: 2160},
    {label: '1080p', value: 1080},
    {label: '720p', value: 720},
    {label: '480p', value: 480},
    {label: '360p', value: 360},
    {label: '270p', value: 270},
] as ResolutionOption[];
