import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { DeviceState } from './bluetoothCommandes';

interface BluetoothStoreState {
    deviceState: DeviceState,
    stateLoaded: boolean,
    mergeDeviceState: (update: DeviceState) => void,
    clear: () => void,
};

const useBluetoothStore = create<BluetoothStoreState>()(
    devtools(
        (set) => ({
            deviceState: {},
            stateLoaded: false,
            mergeDeviceState: (update) => set(state=>({stateLoaded: true, deviceState: {...state.deviceState, ...update}})),
            clear: () => set(()=>({stateLoaded: false, deviceState: {}})),
        })
    ),
);

export default useBluetoothStore;
