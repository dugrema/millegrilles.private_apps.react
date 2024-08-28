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
    csr_present: boolean,
    connecte?: boolean,
}

interface SenseursPassifsStoreState {
    devices: {[key: string]: DeviceReadings},
    deviceConfiguration: {[key: string]: DeviceConfiguration},
    setDevices: (devices: {[key: string]: DeviceReadings}) => void,
    updateDevice: (device: DeviceReadings) => void,
    updatePresence: (device: DeviceReadings) => void,
    updateConfiguration: (uuid_appareil: string, configuration: DeviceConfiguration) => void
    clear: () => void,
};

const useSenseursPassifsStore = create<SenseursPassifsStoreState>()(
    devtools(
        (set) => ({
            devices: {},
            deviceConfiguration: {},
            setDevices: (devices) => {
                // Extract deviceConfiguration
                let deviceConfiguration = Object.values(devices).reduce(
                    (acc: {[key: string]: DeviceConfiguration}, item: DeviceReadings)=>{
                        let {uuid_appareil, configuration} = item;
                        if(uuid_appareil && configuration) acc[uuid_appareil] = configuration; 
                        return acc;
                }, {});
                // Set
                set({devices, deviceConfiguration});
            },
            updateDevice: (device) => set(state => {
                let currentDevice = state.devices[device.uuid_appareil] || {};
                return ({devices: {...state.devices, [device.uuid_appareil]: {...currentDevice, ...device}}});
            }),
            updatePresence: (device) => set(state => ({devices: {...state.devices, [device.uuid_appareil]: device}})),
            updateConfiguration: (uuid_appareil, configuration) => set((state) => ({deviceConfiguration: {...state.deviceConfiguration, [uuid_appareil]: configuration}})),
            clear: () => set(() => ({devices: {}})),
        })
    ),
);

export default useSenseursPassifsStore;
