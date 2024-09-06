import { useMemo, useEffect, useState, useCallback, ChangeEvent } from 'react';
import { Link, useParams } from "react-router-dom";
import useSenseursPassifsStore, { DeviceConfiguration, DeviceReadings, DeviceReadingValue, GeopositionConfiguration } from "./senseursPassifsStore";
import useWorkers from '../workers/workers';
import useConnectionStore from '../connectionStore';
import { geolocate } from '../geolocation';

import CONST_PYTZ_TIMEZONES from '../resources/pytz_timezones.json';

type EditDeviceProps = {
    close: ()=>void,
}

export default function EditDevice(props: EditDeviceProps) {
    const workers = useWorkers();
    const params = useParams();

    let { close } = props;

    let devices = useSenseursPassifsStore(state=>state.devices);
    let deviceConfiguration = useSenseursPassifsStore(state=>state.deviceConfiguration);    

    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let [configuration, setConfiguration] = useState(null as DeviceConfiguration | null);

    let device = useMemo(()=>{
        if(!devices) return;
        let uuid_appareil = params.deviceId as string;
        let deviceValue = devices[uuid_appareil];
        return deviceValue;
    }, [params, devices]);

    let deviceNameOnChangeHandler = useCallback((e: ChangeEvent<HTMLInputElement>)=>{
        let value = e.currentTarget.value;
        setConfiguration({...configuration, descriptif: value});
    }, [configuration, setConfiguration])

    let timezoneOnChangeHandler = useCallback((e: ChangeEvent<HTMLSelectElement>)=>{
        let value = e.currentTarget.value;
        setConfiguration({...configuration, timezone: value});
    }, [configuration, setConfiguration]);

    let configurationOnChange = useCallback((e: DeviceConfiguration)=>{
        setConfiguration({...configuration, ...e});
    }, [configuration, setConfiguration]);

    // Set the device/configuration value once. Avoids updates during the edit.
    useEffect(()=>{
        if(configuration) return;  // Already set
        if(!deviceConfiguration) return;
        let uuid_appareil = params.deviceId as string;
        let configurationValue = deviceConfiguration[uuid_appareil] || {};
        if(configurationValue) {
            setConfiguration(configurationValue);
        }
    }, [params, deviceConfiguration, setConfiguration, configuration]);

    let deviceName = useMemo(()=>configuration?.descriptif || '', [configuration]);

    let uuid_appareil = device?.uuid_appareil;

    let saveHandler = useCallback(()=>{
        if(!uuid_appareil) throw new Error("No uuid_appareil provided for the device");
        if(!configuration) throw new Error("No configuration provided for the device");
        let command = {uuid_appareil, configuration};
        workers?.connection.updateDeviceConfiguration(command)
            .then(response=>{
                close();
            })
            .catch(err=>console.error("Error configuration update", err));
    }, [workers, configuration, close]);

    if(!device || !configuration) return <p>Loading ...</p>;

    return (
        <>
            <nav>
                <Link to='/apps/senseurspassifs/devices' 
                    className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        <i className='fa fa-arrow-left'/> Back
                </Link>
                <button onClick={close} disabled={true} 
                    className='btn inline-block text-center btn bg-indigo-800 hover:bg-indigo-600 active:bg-indigo-500'>
                        <i className='fa fa-edit'/> Edit
                </button>
                <button className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                    <i className='fa fa-trash-o' /> Delete
                </button>
            </nav>

            <h1 className='font-bold text-lg pt-2 pb-4'>Device Id {uuid_appareil}</h1>

            <section>
                <h2 className='font-semibold pt-1 pb-1'>Parameters</h2>
                <div className='grid grid-cols-12'>
                    <div className='col-span-3 pl-1 pr-1'>Device name</div>
                    <div className='col-span-9 pl-1 pr-1'>
                        <input type='text' onChange={deviceNameOnChangeHandler} value={deviceName} 
                            placeholder='Put a descriptive name for this device.'
                            className='w-full text-black' />
                    </div>

                    <div className='col-span-3 pl-1 pr-1'>Version</div>
                    <div className='col-span-9 pl-1 pr-1'>{device.version}</div>
                    <div className='col-span-3 pl-1 pr-1'>Time zone</div>
                    <div className='col-span-9 pl-1 pr-1'>
                        <SelectTimezone value={configuration?.timezone} onChange={timezoneOnChangeHandler} />
                    </div>
                    
                    <div className='col-span-3 pl-1 pr-1'>Location</div>
                    <div className='col-span-4 pl-1 pr-1'>
                        <div className='grid grid-cols-2'>
                            <Geoposition value={configuration} onChange={configurationOnChange} />
                        </div>
                    </div>
                    <div className='col-span-5'></div>

                </div>
            </section>

            <section>
                <h2 className='font-semibold pt-4 pb-1'>Status</h2>
                <div className='grid grid-cols-12'>
                    <div className='col-span-6 mt-3 pl-3 pr-1 pb-2'>
                        Components on the device
                    </div>
                    <div className='col-span-6 mt-3 pr-1 pb-2'>
                    </div>

                    <EditDeviceComponents device={device} configuration={configuration} onChange={configurationOnChange} />
                </div>
            </section>

            <nav className='w-full text-center pt-10'>
                <button onClick={saveHandler} 
                    className='btn bg-indigo-800 hover:bg-indigo-600 active:bg-indigo-500'>
                        Save
                </button>
                <button onClick={close} 
                    className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        Cancel
                </button>
            </nav>
        </>
    );
}

export function SelectTimezone(props: {value?: string, onChange: (e: ChangeEvent<HTMLSelectElement>)=>void}) {
    let options = useMemo(()=>{
        return CONST_PYTZ_TIMEZONES.map(item=>{
            return <option key={item} value={item}>{item}</option>;
        })
    }, [])

    return (
        <select className='text-black' onChange={props.onChange} value={props.value}>
            <option>Select a timezone</option>
            {options}
        </select>
    )
}

function EditDeviceComponents(props: {device: DeviceReadings, configuration: DeviceConfiguration, onChange: (e: DeviceConfiguration)=>void}) {

    let {device, configuration} = props;

    let components = useMemo(()=>{
        let components = device.senseurs;
        if(!components) return [];  // nothing to display.
        
        let names = Object.keys(components);
        let componentsMap = names.map(item=>{
            if(!components) return {name: '', component: <></>};
            let component = components[item];
            return {name: item, component: <EditDeviceComponent key={item} name={item} component={component} configuration={configuration} onChange={props.onChange} />};
        });

        // Sort by name
        componentsMap.sort((a, b)=>a.name.localeCompare(b.name));

        return componentsMap.map(item=>item.component);
    }, [device, configuration]);

    return <>{components}</>;
}

function EditDeviceComponent(props: {name: string, component: DeviceReadingValue, configuration: DeviceConfiguration, onChange: (e: DeviceConfiguration)=>void}) {

    let { name, component, configuration, onChange } = props;

    let [hide, customName] = useMemo(()=>{
        let hide = false;
        let cacher_senseurs = configuration.cacher_senseurs;
        if(cacher_senseurs && cacher_senseurs.includes(name)) {
            hide = true;
        }
        let customName = configuration.descriptif_senseurs?configuration.descriptif_senseurs[name]:null;
        customName = customName || '';
        return [hide, customName];
    }, [name, configuration]);

    let onNameChangehandler = useCallback((e: ChangeEvent<HTMLInputElement>)=>{
        let value = e.currentTarget.value;
        let descriptif_senseurs = configuration.descriptif_senseurs || {};
        descriptif_senseurs[name] = value;
        onChange({descriptif_senseurs});
    }, [name, onChange])

    let onHideChangehandler = useCallback((e: ChangeEvent<HTMLInputElement>)=>{
        let value = e.currentTarget.checked;
        let cacher_senseurs = configuration.cacher_senseurs || [];
        // Remove, also avoids duplicates
        cacher_senseurs = cacher_senseurs.filter(item=>item!==name);
        if(!value) {
            cacher_senseurs.push(name);  // Name
        }
        onChange({cacher_senseurs});
    }, [name, onChange])

    return (
        <>
            <div className='col-span-1 pl-3 pr-1'>
                <input type="checkbox" checked={!hide} onChange={onHideChangehandler}/>
            </div>
            <div className='col-span-3 pl-3 pr-1'>{name}</div>
            <div className='col-span-8 pr-1'>
                <input type="text" className="w-full text-black" 
                    value={customName}
                    onChange={onNameChangehandler}
                    placeholder='Use to change component name' />
            </div>
        </>
    );
}

type GeopositionProps = { 
    value: DeviceConfiguration,
    onChange: (e: DeviceConfiguration)=>void,
};

function Geoposition(props: GeopositionProps) {

    let configuration = props.value;
    let onChange = props.onChange;

    let [geolocateWorking, setGeolocateWorking] = useState(false);
    let [geolocateError, setGeolocateError] = useState('');

    let geoposition = configuration.geoposition;
    let latitude = parseFloat(geoposition?.latitude);
    let longitude = parseFloat(geoposition?.longitude);

    let buttonClassName = useMemo(()=>{
        if(geolocateError) return ' bg-red-700 hover:bg-slate-600 active:bg-slate-500';
        else return ' bg-slate-700 hover:bg-slate-600 active:bg-slate-500';
    }, [geolocateError]);

    let changeHandler = useCallback((e: ChangeEvent<HTMLInputElement>)=>{
        let { name, value } = e.currentTarget;
        
        // Build new value object
        let changeValues = {} as GeopositionConfiguration;
        if(typeof(latitude) === 'number') changeValues['latitude'] = latitude;
        if(typeof(longitude) === 'number') changeValues['longitude'] = longitude;

        // Update
        if(value !== '') {
            let numberValue = Number.parseFloat(value);
            // @ts-ignore
            if(!isNaN(numberValue)) changeValues[name] = numberValue;
            // @ts-ignore
            else changeValues[name] = undefined;
        } else {
            // @ts-ignore
            changeValues[name] = undefined;
        }
        
        onChange({geoposition: changeValues})
    }, [latitude, longitude])
    
    const locationCb = useCallback(()=>{
        setGeolocateWorking(true)
        geolocate()
            .then(result=>{
                let coords = result.coords;
                onChange({geoposition: {latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy}});
                setGeolocateError('');
            })
            .catch(err=>{
                console.error("Geolocation error : ", err);
                setGeolocateError(''+err);
            })
            .finally(()=>{
                setGeolocateWorking(false);
            })
    }, [onChange, setGeolocateError, setGeolocateWorking]);

    return (
        <>
            <div>Use current location</div>
            <div>
                <button onClick={locationCb} disabled={geolocateWorking}
                    className={'btn inline-block text-center ' + buttonClassName}>
                        Detect
                </button>
            </div>
            <div>Latitude</div>
            <div>
                <input type='number' name='latitude' value={latitude} onChange={changeHandler} size={9} min="-90" max="90"
                    className='text-black' />
            </div>
            <div>Longitude</div>
            <div>
                <input type='number' name='longitude' value={longitude} onChange={changeHandler} size={9} min="-180" max="180"
                    className='text-black' />
            </div>
        </>
    );
}

function parseFloat(val: undefined | null | string | number): string | number {
    if(val === null || val === undefined) return '';
    if(typeof(val) === 'number') return val;
    let numberVal = Number.parseFloat(val);
    if(isNaN(numberVal)) return '';
    return numberVal;
}
