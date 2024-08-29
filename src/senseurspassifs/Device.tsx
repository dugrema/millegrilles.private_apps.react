import { useMemo, useEffect, useState, useCallback, ChangeEvent } from 'react';
import { Link, useParams } from "react-router-dom";
import useSenseursPassifsStore, { DeviceConfiguration, DeviceReadings } from "./senseursPassifsStore";
import useWorkers from '../workers/workers';
import useConnectionStore from '../connectionStore';
import { DeviceConnectedIcon, DisplayDeviceName, DisplayDeviceComponents, DisplayReadingsDate } from './Devices';
import { random } from 'millegrilles.cryptography';
import EditDevice from './EditDevice';

export default function Device() {

    const workers = useWorkers();
    const params = useParams();

    let uuid_appareil = params.deviceId as string;

    let devices = useSenseursPassifsStore(state=>state.devices);
    let deviceConfiguration = useSenseursPassifsStore(state=>state.deviceConfiguration);    

    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    let [edit, setEdit] = useState(false);
    let editStartHandler = useCallback(()=>setEdit(true), [setEdit]);
    let editCloseHandler = useCallback(()=>setEdit(false), [setEdit]);

    let deleteHandler = useCallback(()=>{
        workers?.connection.deleteDevice(uuid_appareil)
            .then(()=>{
                console.debug("Device deleted");
            })
            .catch(err=>console.error("Error deleting device ", err));
    }, [workers, uuid_appareil]);

    let restoreHandler = useCallback(()=>{
        workers?.connection.restoreDevice(uuid_appareil)
            .then(()=>{
                console.debug("Device restored");
            })
            .catch(err=>console.error("Error deleting device ", err));
    }, [workers, uuid_appareil]);

    const [device, configuration] = useMemo(()=>{
        if(!devices || !deviceConfiguration) return [null, null];

        let device = devices[uuid_appareil];
        let configuration = deviceConfiguration[uuid_appareil];

        return [device, configuration];
    }, [uuid_appareil, devices, deviceConfiguration])

    let supprime = !!device?.supprime;

    let timezone = useMemo(()=>{
        if(configuration?.timezone) return configuration.timezone;
        // TODO : Charger configuration usager et recuperer timezone
        return 'Default';
    }, [configuration])

    if(!device) return <p>Loading ...</p>;

    if(edit) return <EditDevice close={editCloseHandler} />;

    return (
        <>
            <nav>
                <Link to='/apps/senseurspassifs/devices' 
                    className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        <i className='fa fa-arrow-left'/> Back
                </Link>
                <button onClick={editStartHandler} className='btn bg-indigo-800 hover:bg-indigo-600 active:bg-indigo-500'>
                    <i className='fa fa-edit'/> Edit
                </button>
                {supprime?
                    <button disabled={!ready} onClick={restoreHandler}
                        className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                            <i className='fa fa-trash-o' /> Restore
                    </button>
                :
                    <button disabled={!ready} onClick={deleteHandler}
                        className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                            <i className='fa fa-trash-o' /> Delete
                    </button>
                }
            </nav>

            <h1 className='font-bold text-lg pt-2 pb-4'>Device <DisplayDeviceName value={device} /></h1>

            <Register value={device} />

            <section>
                <h2 className='font-semibold pt-1 pb-1'>Parameters</h2>
                <div className='grid grid-cols-12'>
                    <div className='col-span-3 pl-1 pr-1'>Version</div>
                    <div className='col-span-9 pl-1 pr-1'>{device.version}</div>
                    <div className='col-span-3 pl-1 pr-1'>Time zone</div>
                    <div className='col-span-9 pl-1 pr-1'>{timezone}</div>
                    
                    <div className='col-span-3 pl-1 pr-1'>Location</div>
                    <div className='col-span-4 pl-1 pr-1'>
                        <div className='grid grid-cols-2'>
                            <Geoposition value={configuration}/>
                        </div>
                    </div>
                    <div className='col-span-5'></div>

                </div>
            </section>

            <section>
                <h2 className='font-semibold pt-4 pb-1'>Status</h2>
                <div className='grid grid-cols-12'>
                    <div className='col-span-6 mt-3 pl-3 pr-1 pb-2'>
                        Most recent reading
                    </div>
                    <div className='col-span-6 mt-3 pr-1 pb-2'>
                        <DeviceConnectedIcon value={device} />
                        <DisplayReadingsDate value={device.derniere_lecture} />
                    </div>

                    <DisplayDeviceComponents value={device} skipHeader={true} showHidden={true} />
                </div>
            </section>

        </>
    )
}

type RegisterProps = {value: DeviceReadings};

function Register(props: RegisterProps) {

    let workers = useWorkers();
    let device = props.value;

    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    let [challenge, setChallenge] = useState(null as Array<number> | null);
    let [confirmationReady, setConfirmationReady] = useState(false);
    let [message, setMessage] = useState('');
    let [confirmed, setConfirmed] = useState(false);

    let registerHandler = useCallback(()=>{
        if(!workers) throw new Error("Not initialized");
        setConfirmationReady(false);
        setMessage('');

        let sequence = generateChallenge();
        setChallenge(sequence);

        const command = { uuid_appareil: device.uuid_appareil, challenge: sequence }
        workers.connection.challengeDevice(command)
            .then( response => {
                if(response.ok) {
                    setConfirmationReady(true);
                    setMessage('The code has been sent. Check on your device that it matches then click confirm.');
                } else {
                    setChallenge(null);
                    setConfirmationReady(false);
                    setMessage('There was an error, try again');
                }
            })
            .catch(err=>{
                console.error('Register error %O', err);
                setChallenge(null);
                setConfirmationReady(false);
                setMessage('There was an error, try again');
            });
    }, [workers, device, setChallenge, setConfirmationReady, setMessage]);

    let confirmationHandler = useCallback(()=>{
        if(!workers) throw new Error("Not initialized");
        if(!challenge) throw new Error("Challenge missing");
        const command = { uuid_appareil: device.uuid_appareil, challenge }
        workers.connection.confirmDevice(command)
            .then( response => {
                if(response.ok) {
                    setMessage('Device registered succesfully. It may take a few minutes for it to update.');
                    setConfirmed(true);
                } else {
                    console.error("Confirmation error", response.err);
                    setChallenge(null);
                    setConfirmationReady(false);
                    setConfirmed(false);
                    setMessage('There was an error, try again');
                }
            })
            .catch( err => {
                console.error("Confirmation error", err);
                setChallenge(null);
                setConfirmationReady(false);
                setConfirmed(false);
                setMessage('There was an error, try again');
            })
    }, [workers, device, challenge, setChallenge, setMessage, setConfirmed])

    if(!device.csr_present) return <></>;  // Nothing to do

    return (
        <>
            <p>Register this device</p>
            <button onClick={registerHandler} disabled={!ready || !!challenge}
                className='btn bg-slate-700 hover:bg-slate-600 active:bg-slate-500 disabled:bg-slate-900'>
                    Register
            </button>
            <div className='grid grid-cols-12'>
                <div className='col-span-4'>Device verification code</div>
                <div className='col-span-8'>
                    {challenge?
                        <p>{challenge.map((item, idx)=><span key={idx}>{item}</span>)}</p>
                    :
                        <p>Click on register to generate a code.</p>
                    }
                </div>
                <div className='col-span-4'>Message</div>
                <div className='col-span-8'>{message}</div>
                <div className='col-span-4'>Confirmation</div>
                <div className='col-span-8'>
                    <button disabled={!ready || !confirmationReady || confirmed} onClick={confirmationHandler}
                        className='btn bg-slate-700 hover:bg-slate-600 active:bg-slate-500 disabled:bg-slate-900'>
                            Confirm
                    </button>
                </div>
            </div>
        </>
    )
}

function generateChallenge(): Array<number> {
    // Get 4 digits between 1 and 4
    let randomValue = random.getRandom(4);
    let sequence = [] as Array<number>;
    randomValue.forEach(v=>{
        sequence.push(Math.floor(v / 64 + 1));
    });
    return sequence;
}


type GeopositionProps = { value: DeviceConfiguration };

function Geoposition(props: GeopositionProps) {

    let configuration = props.value;

    if(configuration?.geoposition) {
        let { latitude, longitude }  = configuration.geoposition;

        if(!latitude || !longitude) return <>N/A</>;

        return (
            <>
                <div>Latitude</div>
                <div>{latitude}</div>
                <div>Longitude</div>
                <div>{longitude}</div>
            </>
        );
    }

    return <></>;
}
