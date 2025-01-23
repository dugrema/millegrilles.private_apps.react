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

export type CodecOption = {label: string, value: string};
export const VIDEO_CODEC = [
    {label: 'HEVC (mp4)', value: "hevc"},
    {label: 'VP9 (webm)', value: "vp9"},
    {label: 'H.264 (mp4)', value: "h264"},
] as CodecOption[];
  
export const AUDIO_CODEC = [
    {label: 'Opus', value: "libopus"},
    {label: 'EAC3', value: "eac3"},
    {label: 'AAC', value: "aac"},
] as CodecOption[];
  
export const QUALITY_VIDEO = [
    {label: "Tres Faible (37)", value: 37},
    {label: "Faible (34)", value: 34},
    {label: "Moyen (32)", value: 32},
    {label: "Moyen (31)", value: 31},
    {label: "Moyen (30)", value: 30},
    {label: "Eleve (28)", value: 28},
    {label: "Tres eleve (26)", value: 26},
    {label: "Tres eleve (24)", value: 24},
    {label: "Tres eleve (23)", value: 23},
    {label: "Tres eleve (22)", value: 22},
] as ResolutionOption[];
  
export const BITRATES_AUDIO = [
    {label: "128 kbps", value: 128000},
    {label: "64 kbps", value: 64000},
] as ResolutionOption[];

export type VideoOptionType = {
    qualityVideo: number,
    codecAudio: string,
    bitrateAudio: number,
    preset: string,
    fallback?: boolean,
};

export type VideoProfilesType = {[profile: string]: {[resolution: string]: VideoOptionType}};

export const VIDEO_PROFILES = {
    'vp9': {
        '360': {
            qualityVideo: 28,
            codecAudio: 'libopus',
            bitrateAudio: 128000,
            preset: 'medium',
        },
        '480': {
            qualityVideo: 26,
            codecAudio: 'libopus',
            bitrateAudio: 128000,
            preset: 'medium',
        },
        '720': {
            qualityVideo: 26,
            codecAudio: 'libopus',
            bitrateAudio: 128000,
            preset: 'slow',
        },
        '1080': {
            qualityVideo: 23,
            codecAudio: 'libopus',
            bitrateAudio: 128000,
            preset: 'slow',
        },
        'default': {
            qualityVideo: 23,
            codecAudio: 'libopus',
            bitrateAudio: 128000,
            preset: 'slow',
        },
    },
    'hevc': {
        '360': {
            qualityVideo: 28,
            codecAudio: 'eac3',
            bitrateAudio: 128000,
            preset: 'medium',
        },
        '480': {
            qualityVideo: 26,
            codecAudio: 'eac3',
            bitrateAudio: 128000,
            preset: 'slow',
        },
        '720': {
            qualityVideo: 26,
            codecAudio: 'eac3',
            bitrateAudio: 128000,
            preset: 'slow',
        },
        '1080': {
            qualityVideo: 23,
            codecAudio: 'eac3',
            bitrateAudio: 128000,
            preset: 'slow',
        },
        'default': {
            qualityVideo: 23,
            codecAudio: 'eac3',
            bitrateAudio: 128000,
            preset: 'slow',
        },
    },
    'h264': {
        '270': {
            qualityVideo: 28,
            codecAudio: 'aac',
            bitrateAudio: 64000,
            preset: 'fast',
            fallback: true,
        },
        '360': {
            qualityVideo: 22,
            codecAudio: 'aac',
            bitrateAudio: 128000,
            preset: 'slow',
        },
        '480': {
            qualityVideo: 22,
            codecAudio: 'aac',
            bitrateAudio: 128000,
            preset: 'slow',
        },
        'default': {
            qualityVideo: 22,
            codecAudio: 'aac',
            bitrateAudio: 128000,
            preset: 'slow',
        }
    }
} as VideoProfilesType;
