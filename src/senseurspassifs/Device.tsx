import { useMemo, useEffect, useState, useCallback } from 'react';
import { Link, useParams } from "react-router-dom";
import useSenseursPassifsStore, { DeviceReadings } from "./senseursPassifsStore";
import useWorkers from '../workers/workers';
import useConnectionStore from '../connectionStore';
import { DisplayDeviceName, DisplayDevices } from './Devices';
import { random } from 'millegrilles.cryptography';

export default function Device() {

    const workers = useWorkers();
    const params = useParams();

    let devices = useSenseursPassifsStore(state=>state.devices);
    let deviceConfiguration = useSenseursPassifsStore(state=>state.deviceConfiguration);    

    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    const [device, configuration] = useMemo(()=>{
        if(!devices || !deviceConfiguration) return [null, null];
        let uuid_appareil = params.deviceId as string;

        let device = devices[uuid_appareil];
        let configuration = deviceConfiguration[uuid_appareil];

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

            <button className='btn bg-indigo-800 hover:bg-indigo-600 active:bg-indigo-500'>Edit</button>

            <Register value={device} />

            <div className='grid grid-cols-12 pt-8'>
                <DisplayDevices value={device} skipHeader={true} />
            </div>

            <div className='pt-10'>
                <Link to='/apps/senseurspassifs/devices' 
                    className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        Back
                </Link>
            </div>
        </>
    )
}

type RegisterProps = {value: DeviceReadings};

function Register(props: RegisterProps) {

    let workers = useWorkers();
    let device = props.value;

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
    }, [workers, challenge, setChallenge, confirmationReady, setMessage, setConfirmed])

    if(!device.csr_present) return <></>;  // Nothing to do

    return (
        <>
            <p>Register this device</p>
            <button className='btn bg-slate-700 hover:bg-slate-600 active:bg-slate-500 disabled:bg-slate-900' onClick={registerHandler} disabled={!!challenge}>
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
                    <button disabled={!confirmationReady || confirmed} onClick={confirmationHandler}
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
