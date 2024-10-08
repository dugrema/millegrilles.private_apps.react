import { useCallback, useMemo, useState } from 'react';
import { Link } from "react-router-dom";

import { Formatters } from 'millegrilles.reactdeps.typescript';

import useSenseursPassifsStore, { DeviceReadings, DeviceReadingValue } from './senseursPassifsStore';
import ReadingFormatter, { SwitchButton } from './ReadingFormatter';
import { BluetoothAvailableCheck } from './bluetooth/Bluetooth';
import useBluetoothStore from './bluetooth/bluetoothStore';

// Age (seconds) when readings become stale and when the device is de-facto offline.
const CONST_READINGS_STALE = 150;
const CONST_READINGS_OFFLINE = 1800;


export default function Devices() {

    let bluetoothAvailable = useBluetoothStore(state=>state.bluetoothAvailable);

    let [showOnlyDeleted, setShowOnlyDeleted] = useState(false);
    let showDeletedHandler = useCallback(()=>setShowOnlyDeleted(true), [setShowOnlyDeleted]);
    let hideDeletedHandler = useCallback(()=>setShowOnlyDeleted(false), [setShowOnlyDeleted]);

    return (
        <>
            <div>
                <nav>
                    <Link to='/apps/senseurspassifs'
                        className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                            Back
                    </Link>
                    {showOnlyDeleted?
                        <button onClick={hideDeletedHandler}
                            className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                                View devices
                        </button>
                    :
                        <button onClick={showDeletedHandler}
                            className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                                Deleted devices
                        </button>
                    }
                </nav>
                {bluetoothAvailable?
                    <nav>
                        <Link to='/apps/senseurspassifs/bluetooth' 
                            className='btn inline-block text-center bg-indigo-800 hover:bg-indigo-600 active:bg-indigo-500'>
                                Bluetooth
                        </Link>
                    </nav>                
                    :<></>}
                </div>
            <ListDeviceReadings showOnlyDeleted={showOnlyDeleted} />
            <BluetoothAvailableCheck hide={true} />
        </>
    )
}

function ListDeviceReadings(props: {showOnlyDeleted?: boolean}) {
    let { showOnlyDeleted } = props;

    let devices = useSenseursPassifsStore(state=>state.devices);
    let deviceConfiguration = useSenseursPassifsStore(state=>state.deviceConfiguration);    

    let deviceList = useMemo(()=>{
        if(devices) {
            let deviceIds = Object.keys(devices);
            if(deviceIds.length > 0) {
                let devicesSort = deviceIds.map(item => {
                    let configuration = deviceConfiguration[item];
                    let name = configuration?.descriptif || item;
                    return {uuid_appareil: item, name};
                });
                devicesSort.sort((a,b)=>a.name.localeCompare(b.name));

                let mappedDevices = devicesSort.map(item=>devices[item.uuid_appareil]);

                if(showOnlyDeleted) mappedDevices = mappedDevices.filter(item=>item.supprime);
                else mappedDevices = mappedDevices.filter(item=>!item.supprime);

                return mappedDevices;
            }
        }
        return null;
    }, [devices, deviceConfiguration, showOnlyDeleted])

    if(deviceList) {
        return (
            <section>
                <h2 className='pb-6'>Devices</h2>
                <div className='grid grid-cols-12'>
                    {deviceList.map(item=>{
                        return <DisplayDeviceComponents key={item.uuid_appareil} value={item} />
                    })}
                </div>
            </section>
        )
    } else {
        return (
            <section>
                <h2>Devices</h2>
                <p>No devices.</p>
            </section>
        )
    }

}

type DisplayDeviceReadingsProps = {
    value: DeviceReadings,
    skipHeader?: boolean,
    showHidden?: boolean,
}

export function DisplayDeviceComponents(props: DisplayDeviceReadingsProps) {
    let device = props.value;
    let showHidden = props.showHidden;

    let { uuid_appareil, senseurs: components } = device;
    let deviceConfiguration = useSenseursPassifsStore(state=>state.deviceConfiguration);

    let componentElems = useMemo(()=>{
        if(!components) return null;  // nothing to display.
        
        let names = Object.keys(components);
        let componentsMap = names.map(item=>{
            if(!components) return {name: '', component: <></>};
            let component = components[item];
            let componentType = device.types_donnees?device.types_donnees[item]:null;

            let newName = item;
            let deviceConf = deviceConfiguration[uuid_appareil];
            let componentNameConf = deviceConf?.descriptif_senseurs;
            if(componentNameConf) newName = componentNameConf[item] || item;

            return {
                name: newName, 
                component: <DisplayDeviceReading key={item} name={item} value={component} type={componentType} device={device} showHidden={showHidden} />
            };
        });

        // Sort by name
        componentsMap.sort((a, b)=>a.name.localeCompare(b.name));

        return componentsMap.map(item=>item.component);
    }, [components, device, showHidden, deviceConfiguration, uuid_appareil])

    return (
        <>
            {(!props.skipHeader)?
                <>
                    <div className='col-span-8 mt-3 pl-1 pr-1 pt-1 pb-2 bg-cyan-600 bg-opacity-30'>
                        <Link to={'/apps/senseurspassifs/device/' + uuid_appareil}>
                            <DisplayDeviceName value={device} />
                        </Link>
                    </div>
                    <div className='col-span-4 mt-3 pl-1 pr-1 pt-1 pb-2 text-right bg-cyan-600 bg-opacity-30'>
                        {device.csr_present?
                            <Link to={'/apps/senseurspassifs/device/' + uuid_appareil}
                                className='btn inline-block bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-center'><span>Register</span></Link>
                        :
                            <>
                                <DeviceConnectedIcon value={device} />
                                <DisplayReadingsDate value={device.derniere_lecture} />
                            </>
                        }
                        
                    </div>
                </>
            :<></>}
            {componentElems?componentElems
            :
                <div className='col-span-12 pl-3'>There are no sensors or switches currently reported on this device. You may need to register it.</div>
            }
            
        </>
    )
}

type DeviceConnectedIconProps = { value: DeviceReadings };

export function DeviceConnectedIcon(props: DeviceConnectedIconProps) {
    let device = props.value;
    if(device.connecte) {
        return <span><i className='fa fa-wifi text-green-500 pr-1'/></span>;
    } else if(device.connecte === false) {
        return <span><i className='fa fa-wifi text-red-500 pr-1'/></span>;
    }
    return <></>;
}

type DisplayDeviceReadingProps = {
    name: string,
    value: DeviceReadingValue
    type?: string | null,
    device: DeviceReadings,
    showHidden?: boolean,
}

function DisplayDeviceReading(props: DisplayDeviceReadingProps) {

    let {name, value, type, device, showHidden} = props;
    type = value?.type || type;
    let uuid_appareil = device.uuid_appareil;

    let [toggling, setToggling] = useState(false);
    let startTogglingHandler = useCallback(()=>{
        if(toggling) return;  // Skip
        setToggling(true);
        setTimeout(()=>setToggling(false), 3_000);
    }, [toggling, setToggling])

    let deviceConfiguration = useSenseursPassifsStore(state=>state.deviceConfiguration);

    let [componentName, hideComponent] = useMemo(()=>{
        let newName = name;
        let deviceConf = deviceConfiguration[uuid_appareil];
        let componentNameConf = deviceConf?.descriptif_senseurs;
        if(componentNameConf) newName = componentNameConf[name] || name;

        let hideComponents = deviceConf?.cacher_senseurs;
        let hide = hideComponents && hideComponents.includes(name);

        return [newName, hide];
    }, [name, deviceConfiguration, uuid_appareil])

    let classNameHidden = useMemo(()=>{
        if(hideComponent && showHidden) {
            return ' text-gray-500';
        }
        return '';
    }, [hideComponent, showHidden]);

    let valueElement = useMemo(()=>{
        let v = value.valeur;
        let v_str = value.valeur_str;
        if(type === 'switch') {
            if(!v) v = 0;
            return (
                <SwitchButton device={device} senseurId={name} value={v} toggling={toggling} 
                    startTogglingCb={startTogglingHandler} />
            );
        } else if(!v && v_str) {
            // String display
            return <span>{v_str}</span>
        } else if(v) {
            return <ReadingFormatter value={v} type={type} />
        } else {
            <span>Unknown type</span>
        }
    }, [type, value, device, name, startTogglingHandler, toggling]);

    if(hideComponent && !props.showHidden) return <></>;

    return (
        <>
            <div className={'col-span-6 pl-3'+classNameHidden}>
                <Link to={`/apps/senseurspassifs/device/${uuid_appareil}/component/${encodeURIComponent(name)}`}>{componentName}</Link>
            </div>
            <div className={'col-span-3'+classNameHidden}>{valueElement}</div>
            <div>
            </div>
        </>
    )
}

export function DisplayDeviceName(props: DisplayDeviceReadingsProps) {

    let device = props.value;

    let deviceConfiguration = useSenseursPassifsStore(state=>state.deviceConfiguration);    

    let name = useMemo(()=>{
        if(!device) return '';
        let uuid_appareil = device.uuid_appareil;
        let deviceConf = deviceConfiguration[uuid_appareil];
        return deviceConf?.descriptif || device.uuid_appareil;
    }, [device, deviceConfiguration])

    return <span>{name}</span>;
}

export function DisplayReadingsDate(props: {value: number}) {

    let readingDate = props.value;

    let now = useSenseursPassifsStore(state=>state.now);

    let className = useMemo(()=>{
        if(now - CONST_READINGS_OFFLINE > readingDate) {
            return 'text-red-600'
        } else if (now - CONST_READINGS_STALE > readingDate) {
            return 'text-yellow-300';
        }
        return '';
    }, [now, readingDate])

    return (
        <span className={className}>
            <Formatters.FormatterDate value={readingDate} />
        </span>
    )
}
