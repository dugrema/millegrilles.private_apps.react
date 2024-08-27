import { useMemo } from 'react';
import { Link } from "react-router-dom";

import { Formatters } from 'millegrilles.reactdeps.typescript';

import useSenseursPassifsStore, { DeviceReadings, DeviceReadingValue } from './senseursPassifsStore';
import ReadingFormatter from './ReadingFormatter';

export default function Devices() {
    return (
        <>
            <div>
                <nav><Link to='/apps/senseurspassifs'>Back</Link></nav>
                <nav><Link to='/apps/senseurspassifs/bluetooth'>Add Device</Link></nav>
            </div>
            <ListDeviceReadings />
        </>
    )
}

function ListDeviceReadings() {
    let devices = useSenseursPassifsStore(state=>state.devices);

    let deviceList = useMemo(()=>{
        if(devices) {
            let values = Object.values(devices);
            if(values.length > 0) return values;
        }
        return null;
    }, [devices])

    if(deviceList) {
        return (
            <section>
                <h2 className='pb-6'>Devices</h2>
                <div className='grid grid-cols-12'>
                    {deviceList.map(item=>{
                        return <DisplayDevices key={item.uuid_appareil} value={item} />
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
}

export function DisplayDevices(props: DisplayDeviceReadingsProps) {
    let device = props.value;

    let { uuid_appareil } = device;

    return (
        <>
            {(!props.skipHeader)?
                <>
                    <div className='col-span-8'>
                        <Link to={'/apps/senseurspassifs/device/' + uuid_appareil}>
                            <DisplayDeviceName value={device} />
                        </Link>
                    </div>
                    <div className='col-span-3'>
                        {device.csr_present?
                            <Link to={'/apps/senseurspassifs/device/' + uuid_appareil}
                                className='btn inline-block bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-center'><span>Register</span></Link>
                        :
                            <Formatters.FormatterDate value={device.derniere_lecture} />
                        }
                        
                    </div>
                </>
            :<></>}
            {device.senseurs?
                Object.keys(device.senseurs).map(sensorName=>{
                    let sensorReading = device.senseurs?device.senseurs[sensorName]:null;
                    
                    if(sensorReading) {
                        let sensorType = device.types_donnees?device.types_donnees[sensorName]:null;
                        return <DisplayDeviceReading key={sensorName} name={sensorName} value={sensorReading} type={sensorType} device={device} />
                    } else {
                        return <span></span>
                    }
                })
            :
                <div className='col-span-12'>There are no sensors or switches currently reported on this device. You may need to register it.</div>
            }
            
        </>
    )
}

type DisplayDeviceReading = {
    name: string,
    value: DeviceReadingValue
    type?: string | null,
    device: DeviceReadings,
}

function DisplayDeviceReading(props: DisplayDeviceReading) {

    let {name, value, type, device} = props;
    type = value?.type || type;
    let uuid_appareil = device.uuid_appareil;

    let deviceConfiguration = useSenseursPassifsStore(state=>state.deviceConfiguration);        

    let sensorName = useMemo(()=>{
        let deviceConf = deviceConfiguration[uuid_appareil];
        let sensorConf = deviceConf?.descriptif_senseurs;
        if(sensorConf) name = sensorConf[name] || name;
        return name;
    }, [name, deviceConfiguration, uuid_appareil])

    return (
        <>
            <div className='col-span-8'>
                {sensorName}
            </div>
            <div className='col-span-4'>
                <ReadingFormatter value={value.valeur} type={type} />
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
