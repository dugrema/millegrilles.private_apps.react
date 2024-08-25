import { useMemo, useEffect } from 'react';
import { Link, useParams } from "react-router-dom";
import useSenseursPassifsStore from "./senseursPassifsStore";
import useWorkers from '../workers/workers';
import useConnectionStore from '../connectionStore';
import { DisplayDeviceName, DisplayDevices } from './Devices';

export default function Device() {

    const workers = useWorkers();
    const params = useParams();

    let devices = useSenseursPassifsStore(state=>state.devices);
    let deviceConfiguration = useSenseursPassifsStore(state=>state.deviceConfiguration);    

    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    const [device, configuration] = useMemo(()=>{
        if(!devices || !deviceConfiguration) return [null, null];
        let uuid_appareil = params.deviceId as string;

        console.debug("Loading app %O, deviceInfo: %O, config: %O", uuid_appareil, devices, deviceConfiguration);

        let device = devices[uuid_appareil];
        let configuration = deviceConfiguration[uuid_appareil];

        console.debug("Device %O, configuration %O", device, configuration);

        return [device, configuration];
    }, [params, devices, deviceConfiguration])

    useEffect(()=>{
        if(!workers || !ready || !params.uuid_appareil) return;  // Nothing to do

        // Initial load or reload of the device

        // Subscribe to events

        // Unsubscribe from events

    }, [workers, ready, params]);

    if(!device) return <p>Loading ...</p>;

    return (
        <>
            <h1>Device <DisplayDeviceName value={device} /></h1>

            <div className='grid grid-cols-12'>
                <DisplayDevices value={device} />
            </div>

            <div className='pt-10'>
                <Link to='/apps/senseurspassifs/devices'>Back</Link>
            </div>
        </>
    )
}
