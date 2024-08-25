import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export type Devices = {};

export type DeviceConfiguration = {
    cacher_senseurs?: boolean,
    descriptif?: string,
    descriptif_senseurs?: {[key: string]: string},
    displays?: Object,
    geoposition?: {latitude: number, longitude: number, accuracy?: number},
    programmes?: Object
};

export type DeviceReadingValue = {
    timestamp: number, 
    type: string, 
    valeur: number | string
};

export type DeviceReadings = {
    uuid_appareil: string,
    instance_id: string,
    derniere_lecture: number,
    senseurs?: {[key: string]: DeviceReadingValue},
    types_donnees?: {[key: string]: string},
    configuration?: DeviceConfiguration,
}

interface SenseursPassifsStoreState {
    devices: {[key: string]: DeviceReadings},
    setDevices: (devices: {[key: string]: DeviceReadings}) => void,
    updateDevice: (device: DeviceReadings) => void
    clear: () => void,
};

const useSenseursPassifsStore = create<SenseursPassifsStoreState>()(
    devtools(
        (set) => ({
            devices: {},
            setDevices: (devices) => set(() => ({ devices })),
            updateDevice: (device) => set(state => ({devices: {...state.devices, [device.uuid_appareil]: device}})),
            clear: () => set(() => ({devices: {}})),
        })
    ),
);

export default useSenseursPassifsStore;
