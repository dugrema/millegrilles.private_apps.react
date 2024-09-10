import { ChangeEvent, MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import useWorkers from "../workers/workers";
import { Link, useParams } from "react-router-dom";
import useSenseursPassifsStore, { DeviceConfiguration, DisplayConfiguration, DisplayConfigurationLine, DisplayInformation } from "./senseursPassifsStore";
import useConnectionStore from "../connectionStore";
import { ComponentListLoader, DeviceComponentPicklist, DeviceComponentType } from "./DevicePicklists";

type EditValue = { display: DisplayInformation, configuration?: DisplayConfiguration };

export default function EditDeviceDisplays() {

    const workers = useWorkers();
    const params = useParams();

    let uuid_appareil = params.deviceId as string;

    let devices = useSenseursPassifsStore(state=>state.devices);
    let deviceConfiguration = useSenseursPassifsStore(state=>state.deviceConfiguration);   
    
    let [editValue, setEditValue] = useState(null as EditValue | null);
    let [hasChanged, setHasChanged] = useState(false);
    let [selectedDisplay, setSelectedDisplay] = useState('');
    let displayOnChange = useCallback((e: ChangeEvent<HTMLSelectElement>)=>{
        setSelectedDisplay(e.currentTarget.value);
    }, [setSelectedDisplay]);
    let displayEditClose = useCallback(()=>setSelectedDisplay(''), [setSelectedDisplay]);

    let [device, configuration] = useMemo(()=>{
        if(!uuid_appareil || !devices) return [null, null];
        let device = devices[uuid_appareil];
        let configuration = deviceConfiguration?deviceConfiguration[uuid_appareil]:null;
        return [device, configuration];
    }, [uuid_appareil, devices, deviceConfiguration])

    let [displays, displaysConfiguration] = useMemo(()=>{
        return [device?.displays, configuration?.displays];
    }, [device, configuration]);

    let updateDisplayConfiguration = useCallback((configuration: DisplayConfiguration)=>{
        if(!editValue) throw new Error("Value not ready to edit");
        setEditValue({...editValue, configuration});
        setHasChanged(true);
    }, [editValue, setEditValue, setHasChanged]);

    let saveChanges = useCallback(()=>{
        if(!workers) throw new Error("Workers not initialized");
        if(!device || !editValue || !configuration) throw new Error("Device not selected");
        if(!editValue.configuration) throw new Error("No configuration to update");
        let updateCommand = formatConfigurationUpdate(device.uuid_appareil, configuration, editValue.display.name, editValue.configuration);
        workers.connection.updateDeviceConfiguration(updateCommand)
            .then(result=>{
                if(result.ok !== false) {
                    // The result contains an updated version of the device
                    displayEditClose();
                } else {
                    console.error("Erreur updating device configuration: ", result);
                }
            })
            .catch(err=>console.error("Error updating device configuration: ", err));
    }, [workers, device, configuration, editValue, displayEditClose]);

    // Lock a version of the screen configuration for editing.
    useEffect(()=>{
        if(editValue) {
            // Change, but there is already a locked value. Check if we reset or abort.
            if(!selectedDisplay) {
                // Reset
                setEditValue(null);
                setHasChanged(false);
            }
            return;
        }
        if(selectedDisplay && displays) {
            // There is a selected value, lock display information and configuration
            let displayArray = displays.filter(item=>item.name === selectedDisplay);
            let display = displayArray?.pop();
            let displayConfiguration = displaysConfiguration?displaysConfiguration[selectedDisplay]:undefined;
            if(display) {
                setEditValue({display, configuration: displayConfiguration});
            }
        }
    }, [displays, displaysConfiguration, editValue, selectedDisplay, setEditValue, setHasChanged]);

    return (
        <>
            <nav>
                <Link to={`/apps/senseurspassifs/device/${uuid_appareil}`}
                    className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        Back
                </Link>
            </nav>

            <h1 className='font-bold text-lg pt-2 pb-4'>Displays</h1>
            <section className='grid grid-cols-4 pb-4'>
                <h2 className="col-span-1">Select a display to edit</h2>
                <div className="col-span-3">
                    <DisplaySelect displays={displays} value={selectedDisplay} onChange={displayOnChange} />
                </div>
            </section>
            <EditDisplay uuid_appareil={uuid_appareil} value={editValue} onChange={updateDisplayConfiguration} save={saveChanges} close={displayEditClose} hasChanged={hasChanged} />
        </>
    );
}

type DisplaySelectProps = {
    displays?: DisplayInformation[],
    value?: string,
    onChange: (e: ChangeEvent<HTMLSelectElement>)=>void,
};

function DisplaySelect(props: DisplaySelectProps) {
    let {displays, value, onChange} = props;

    let options = useMemo(()=>{
        return displays?.map(item=>{
            let displayName = item.name;
            return <option key={displayName} value={displayName}>{displayName}</option>;
        });
    }, [displays])

    return (
        <select className='text-black disabled:bg-slate-600' onChange={onChange} value={props.value} disabled={!!value}>
            <option>No display selected</option>
            {options}
        </select>
    )
}

type EditDisplayProps = {
    uuid_appareil: string,
    value: EditValue | null,
    onChange: (e: DisplayConfiguration) => void,
    hasChanged: boolean,
    save: ()=>void,
    close: ()=>void,
};

function EditDisplay(props: EditDisplayProps) {

    let { uuid_appareil, value, onChange, hasChanged, save, close } = props;
    let display = value?.display;
    let configuration = value?.configuration;

    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    let saveOnClick = useCallback(()=>{
        if(configuration) {
            save();
        } else {
            close();
        }
    }, [configuration, close, save]);

    let DisplayEditElement = useMemo(()=>{
        if(display?.format === 'text') return DisplayLines;
        return UnsupportedDisplay;
    }, [display]);

    let durationOnChange = useCallback((e: ChangeEvent<HTMLInputElement>)=>{
        let value = e.currentTarget.value;
        let valueNumber = Number.parseInt(value);
        if(valueNumber) {
            let configUpdate = {...configuration, afficher_date_duree: valueNumber};
            onChange(configUpdate);
        }
    }, [configuration, onChange]);

    if(!display || !uuid_appareil) return <></>;  // Nothing to do

    return (
        <>
            <section>
                <h2 className='font-bold pt-2 pb-4'>Display {display.name}</h2>

                <div className='grid grid-cols-4'>
                    <div>Display name</div>
                    <div className="col-span-3">{display.name}</div>
                    <div>Display type</div>
                    <div className="col-span-3">{display.format}</div>
                    <div>Display size</div>
                    <div className="col-span-3">{display.width} x {display.height}</div>
                    <div>Time page duration</div>
                    <div className="col-span-3">
                        <input type='number' value={configuration?.afficher_date_duree || 0} min={0} max={180}
                            onChange={durationOnChange} className='text-black' />
                    </div>
                </div>

            </section>

            <section className="pt-4">
                <DisplayEditElement uuid_appareil={uuid_appareil} configuration={configuration} onChange={onChange} />
            </section>

            <div className="pt-6 w-full text-center">
                <button onClick={saveOnClick} disabled={!ready || !hasChanged}
                    className='btn inline-block text-center bg-indigo-800 hover:bg-indigo-600 active:bg-indigo-500 disabled:bg-indigo-900'>
                        Save
                </button>
                <button onClick={close}
                    className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        Cancel
                </button>
            </div>

            <section>
                <MaskReference />
            </section>
        </>
    )
}

type DisplayLinesProps = { uuid_appareil: string, configuration?: DisplayConfiguration, onChange: (configuration: DisplayConfiguration) => void };

function UnsupportedDisplay() {
    return <p>The display uses an unsupported format. Editing is disabled.</p>
}

function DisplayLines(props: DisplayLinesProps) {

    let { uuid_appareil, configuration, onChange } = props;
    let lines = useMemo(()=>configuration?.lignes || [], [configuration]);

    let [componentList, setComponentList] = useState([] as Array<DeviceComponentType>);

    let addLineHandler = useCallback(()=>{
        let lines = configuration?.lignes || [];
        lines = [...lines, {variable: '', masque: '', duree: 5}];  // Copy, add new line
        let configUpdate = {...configuration, lignes: lines};
        onChange(configUpdate);
    }, [configuration, onChange]);

    let removeLineHandler = useCallback((e: MouseEvent<HTMLButtonElement>)=>{
        let lineIdx = Number.parseInt(e.currentTarget.value);
        let lines = configuration?.lignes || [];
        lines = lines.filter((_,idx)=>idx!==lineIdx);  // Create new array
        let configUpdate = {...configuration, lignes: lines};
        onChange(configUpdate);
    }, [configuration, onChange]);

    let moveLineHandler = useCallback((e: MouseEvent<HTMLButtonElement>)=>{
        let lineIdx = Number.parseInt(e.currentTarget.value);
        let direction = e.currentTarget.dataset.dir;
        let lines = configuration?.lignes || [];
        lines = [...lines];  // Make a copy

        if(direction === 'up') {
            if(lineIdx === 0) return;  // Nothing to do
            let movedItem = lines.splice(lineIdx-1, 1).pop();
            if(movedItem) lines.splice(lineIdx, 0, movedItem);
        } else if(direction === 'down') {
            if(lineIdx === lines.length-1) return;  // Nothing to do
            let movedItem = lines.splice(lineIdx, 1).pop();
            if(movedItem) lines.splice(lineIdx+1, 0, movedItem);
        } else throw new Error("Unsupported direction");

        let configUpdate = {...configuration, lignes: lines};
        onChange(configUpdate);

    }, [configuration, onChange]);

    let lineFormatOnChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
        let lineIdx = Number.parseInt(e.currentTarget.dataset.idx as string);
        let value = e.currentTarget.value;
        let lines = configuration?.lignes || [];
        lines = [...lines];  // Copy

        // Update line
        lines[lineIdx] = {...lines[lineIdx], masque: value};

        let configUpdate = {...configuration, lignes: lines};
        onChange(configUpdate);
    }, [configuration, onChange]);

    let lineDurationOnChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
        let lineIdx = Number.parseInt(e.currentTarget.dataset.idx as string);
        let value = e.currentTarget.value;
        let lines = configuration?.lignes || [];
        lines = [...lines];  // Copy

        let valueNumber = Number.parseInt(value);
        if(!valueNumber) {
            valueNumber = 0;
        }
        lines[lineIdx] = {...lines[lineIdx], duree: valueNumber};

        let configUpdate = {...configuration, lignes: lines};
        onChange(configUpdate);
    }, [configuration, onChange]);

    let lineComponentOnChange = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
        let lineIdx = Number.parseInt(e.currentTarget.dataset.idx as string);
        let value = e.currentTarget.value;
        let lines = configuration?.lignes || [];
        lines = [...lines];  // Copy

        // Update line
        lines[lineIdx] = {...lines[lineIdx], variable: value};

        let configUpdate = {...configuration, lignes: lines};
        onChange(configUpdate);
    }, [configuration, onChange]);

    return (
        <>
            <h2 className='font-bold pt-2 pb-4'>Edit display lines</h2>
            <p>
                Mask formatting reference: 
                <a href='https://docs.python.org/3/library/stdtypes.html#printf-style-string-formatting' target='_blank' rel='noreferrer'
                    className='pl-1 underline font-bold'>
                    Python mask formatting<i className='fa fa-external-link pl-1' />
                </a>.</p>
            <div className='grid grid-cols-12 pt-3'>
                <div className='pr-4 text-right'>Line</div>
                <div className='text-center'>Move</div>
                <div className='col-span-5'>Component</div>
                <div className='col-span-3'>Format</div>
                <div>Duration</div>
                <div>Remove</div>
                {lines.map((item, idx)=>{
                    let last = idx === lines.length - 1;
                    return (
                        <DisplayLine key={''+idx+item.variable} idx={idx} uuid_appareil={uuid_appareil} value={item} 
                            components={componentList} 
                            remove={removeLineHandler} 
                            move={moveLineHandler} 
                            formatOnChange={lineFormatOnChange}
                            durationOnChange={lineDurationOnChange}
                            componentOnChange={lineComponentOnChange}
                            last={last} />
                    );
                })}
            </div>
            <div className="w-full text-center pt-4">
                <button onClick={addLineHandler}
                    className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        + Add line
                </button>
            </div>
            <ComponentListLoader setComponentList={setComponentList} />
        </>
    )
}

type DisplayLineProps = {
    idx: number, 
    uuid_appareil: string,
    value: DisplayConfigurationLine, 
    components: Array<DeviceComponentType>, 
    move: (e: MouseEvent<HTMLButtonElement>)=>void,
    remove: (e: MouseEvent<HTMLButtonElement>)=>void,
    formatOnChange: (e: ChangeEvent<HTMLInputElement>)=>void,
    durationOnChange: (e: ChangeEvent<HTMLInputElement>)=>void,
    componentOnChange: (e: ChangeEvent<HTMLSelectElement>)=>void,
    last: boolean,
};

function DisplayLine(props: DisplayLineProps) {

    let {idx, uuid_appareil, value, components, move, remove, formatOnChange, durationOnChange, componentOnChange, last} = props;

    return (
        <>
            <div className='text-right pr-4'>{idx+1}</div>
            <div className='text-center'>
                <button onClick={move} value={''+idx} data-dir='up' disabled={idx===0}
                    className='varbtn w-8 mt-0 pt-2 pb-2 mb-2 inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        <i className='fa fa-arrow-up'/>
                </button>
                <button onClick={move} value={''+idx} data-dir='down' disabled={last}
                    className='varbtn w-8 mt-0 pt-2 pb-2 mb-2 inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        <i className='fa fa-arrow-down'/>
                </button>
            </div>
            <div className='col-span-5'>
                <DeviceComponentPicklist uuid_appareil={uuid_appareil} components={components} value={value.variable || ''} onChange={componentOnChange} idx={idx} />
            </div>
            <div className='col-span-3'>
                <input type="text" value={value.masque} onChange={formatOnChange} data-idx={idx}
                        className='text-black w-full' />
            </div>
            <div className='col-span-1'>
                <input type="number" min={0} max={180} value={value.duree} onChange={durationOnChange} data-idx={idx}
                    className='text-black' />
            </div>
            <div>
                <button onClick={remove} value={''+idx}
                    className='varbtn w-10 mt-0 pt-2 pb-2 mb-2 inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        <i className='fa fa-close' />
                </button>
            </div>
        </>
    )
}

function MaskReference() {

    let copyToClipboard = useCallback((e: MouseEvent<HTMLSpanElement>)=>{
        let child = e.currentTarget.lastChild;
        if(child?.textContent) {
            navigator.clipboard.writeText(child.textContent)
                .catch(err=>console.error("Error copying to clipboard: ", err));
        }
    }, [])

    return (
        <>
            <h2 className='font-bold pt-2 pb-4'>Sample formats</h2>

            <p>Here are some sample line mask formats for reference. Click on a value to copy it to the clipboard.</p>

            <div className='grid grid-cols-4'>

                <div className="pt-4">Text</div>
                <div className='pt-4 col-span-3'>
                    <span className='font-mono cursor-pointer' onClick={copyToClipboard}>{'{}'}</span>
                </div>

                <div className='col-span-4 pt-4 font-bold'>For 16 character displays</div>

                <div>Temperature</div>
                <div className='col-span-3'>
                    <span className='font-mono cursor-pointer' onClick={copyToClipboard}>{'Temp     {: 5.1f}C'}</span>
                </div>

                <div>Humidity</div>
                <div className='col-span-3'>
                    <span className='font-mono cursor-pointer' onClick={copyToClipboard}>{'Humidity  {:4.1f}%'}</span>
                </div>

                <div>Pressure</div>
                <div className='col-span-3'>
                    <span className='font-mono cursor-pointer' onClick={copyToClipboard}>{'Press   {:4d}hPa'}</span>
                </div>

            </div>
        </>
    )
}

function formatConfigurationUpdate(
    uuid_appareil: string, configuration: DeviceConfiguration, displayName: string, display: DisplayConfiguration) 
{
    let displays = configuration.displays || {};
    displays[displayName] = display;
    configuration.displays = displays;
    return {uuid_appareil, configuration};
}
