import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { DeviceState } from './bluetoothCommandes';

interface BluetoothStoreState {
    bluetoothAvailable: boolean,
    deviceState: DeviceState,
    stateLoaded: boolean,
    setBluetoothAvailable: (status: boolean) => void,
    mergeDeviceState: (update: DeviceState) => void,
    clear: () => void,
};

const useBluetoothStore = create<BluetoothStoreState>()(
    devtools(
        (set) => ({
            bluetoothAvailable: false,
            deviceState: {},
            stateLoaded: false,
            setBluetoothAvailable: (status) => set(()=>({bluetoothAvailable: status})),
            mergeDeviceState: (update) => set(state=>({stateLoaded: true, deviceState: {...state.deviceState, ...update}})),
            clear: () => set(()=>({stateLoaded: false, deviceState: {}})),
        })
    ),
);

export default useBluetoothStore;
