import { useEffect, useMemo } from 'react';
import { Link } from "react-router-dom";
import { proxy } from 'comlink';

import useWorkers from '../workers/workers';
import useConnectionStore from '../connectionStore';
import useSenseursPassifsStore, { DeviceReadings, DeviceReadingValue } from './senseursPassifsStore';
import { SubscriptionMessage } from 'millegrilles.reactdeps.typescript';

export default function Devices() {

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let setDevices = useSenseursPassifsStore(state=>state.setDevices);
    let updateDevice = useSenseursPassifsStore(state=>state.updateDevice);
    
    let deviceEventCb = useMemo(()=>{
        return proxy((event: SubscriptionMessage)=>{
            let message = event.message as DeviceReadings;
            if(message && message.senseurs) updateDevice(message);
        })
    }, [updateDevice])

    useEffect(()=>{
        if(!workers || !ready || !deviceEventCb) return;

        // Load user devices
        workers.connection.getUserDevices()
            .then(deviceResponse=>{
                if(deviceResponse.ok) {
                    // Build list into a map of uuid_appareils:device
                    let mappedReadings = deviceResponse.appareils.reduce((acc: {[key: string]: DeviceReadings}, device)=>{
                        acc[device.uuid_appareil] = device;
                        return acc;
                    }, {})
                    setDevices(mappedReadings);
                } else {
                    console.error("Error loading devices: %O", deviceResponse.err)
                }
            })
            .catch(err=>console.error("Error loading device list", err));

        // Subscribe to device events
        workers.connection.subscribeUserDevices(deviceEventCb)
            .catch(err=>{
                console.debug("Error subscribing to user events", err);
            })

        // Subscription cleanup
        return () => {
            if(workers) workers.connection.unsubscribeUserDevices(deviceEventCb)
                .catch(err=>{
                    console.info("Error unsubscribing to user events", err);
                })
        }
    }, [workers, ready, setDevices, deviceEventCb])

    return (
        <>
            <div>
                <nav><Link to='/apps/senseurspassifs'>Back</Link></nav>
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
}

function DisplayDevices(props: DisplayDeviceReadingsProps) {
    let device = props.value;
    return (
        <>
            <div className='col-span-8'>
                {device.uuid_appareil}
            </div>
            <div className='col-span-4'>
                {device.derniere_lecture}
            </div>
            {device.senseurs?
                Object.keys(device.senseurs).map(sensorName=>{
                    let sensorReading = device.senseurs?device.senseurs[sensorName]:null;
                    
                    if(sensorReading) {
                        let sensorType = device.types_donnees?device.types_donnees[sensorName]:null;
                        return <DisplayDeviceReading key={sensorName} name={sensorName} value={sensorReading} type={sensorType} />
                    } else {
                        return <span></span>
                    }
                })
            :''}
            
        </>
    )
}

type DisplayDeviceReading = {
    name: string,
    value: DeviceReadingValue
    type?: string | null,
}

function DisplayDeviceReading(props: DisplayDeviceReading) {

    let {name, value, type} = props;
    type = value?.type || type;

    return (
        <>
            <div className='col-span-4'>
                {name}
            </div>
            <div className='col-span-4'>
                {value.valeur}
            </div>
            <div className='col-span-4'>
                {type}
            </div>
        </>
    )
}