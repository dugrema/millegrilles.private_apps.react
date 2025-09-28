import { Link, useParams } from "react-router-dom";
import useWorkers from "../workers/workers";
import useSenseursPassifsStore, { DeviceConfiguration, ProgramConfiguration, ProgramsConfiguration } from "./senseursPassifsStore";
import { JSX, ChangeEvent, Dispatch, MouseEvent, useCallback, useMemo, useState } from "react";
import useConnectionStore from "../connectionStore";
import { v1 as uuidv1 } from 'uuid';

import { HumidificatorProgramEditor, WeeklyScheduleProgramEditor, TemperatureProgramEditor } from './ProgramEditor';

type EditValue = { configuration?: ProgramConfiguration };

export default function EditDevicePrograms() {

    const workers = useWorkers();
    const params = useParams();

    let uuid_appareil = params.deviceId as string;

    let devices = useSenseursPassifsStore(state=>state.devices);
    let deviceConfiguration = useSenseursPassifsStore(state=>state.deviceConfiguration);   
    
    let [editValue, setEditValue] = useState(null as EditValue | null);
    let [classLocked, setClassLocked] = useState(true);
    let configurationOnChange = useCallback((value: ProgramConfiguration)=>{
        setEditValue({configuration: value});
    }, [setEditValue]);
    let programEditClose = useCallback(()=>{
        setEditValue(null);
        setClassLocked(true);
    }, [setEditValue, setClassLocked]);

    let configuration = useMemo(()=>{
        if(!uuid_appareil || !devices) return null;
        let configuration = deviceConfiguration?deviceConfiguration[uuid_appareil]:null;
        return configuration;
    }, [uuid_appareil, devices, deviceConfiguration])

    let saveOnClick = useCallback(()=>{
        if(!workers) throw new Error("Workers not initialized");
        if(!editValue?.configuration) throw new Error("Configuration not available");
        if(!deviceConfiguration) throw new Error("Device configuration not available");

        let configuration = editValue.configuration;

        let deviceConfig = deviceConfiguration[uuid_appareil];
        if(!deviceConfig) throw new Error("No configuration for device");

        let programs = deviceConfig.programmes || {};
        programs = {...programs, [configuration.programme_id]: configuration};
        let configurationUpdated = {...deviceConfig};
        configurationUpdated.programmes = programs;

        let command = {uuid_appareil, configuration: configurationUpdated};

        workers.connection.updateDeviceConfiguration(command)
            .then(result=>{
                if(result) {
                    programEditClose();
                }
            })
            .catch(err=>console.error("Error saving program updates: ", err));
    }, [workers, editValue, programEditClose, deviceConfiguration, uuid_appareil]);

    let removeProgram = useCallback((e: MouseEvent<HTMLButtonElement>)=>{
        if(!workers) throw new Error("Workers not initialized");
        if(!deviceConfiguration) throw new Error("Device configuration not available");

        let programId = e.currentTarget.value;

        let configuration = deviceConfiguration[uuid_appareil];
        if(!configuration) throw new Error("Unknown deviceId");

        let programs = configuration.programmes || {};
        programs = {...programs};
        delete programs[programId];

        let configurationUpdated = {...configuration};
        configurationUpdated.programmes = programs;

        let command = {uuid_appareil, configuration: configurationUpdated};

        workers.connection.updateDeviceConfiguration(command)
            .catch(err=>console.error("Error saving program updates: ", err));

    }, [workers, uuid_appareil, deviceConfiguration]);

    let programs = useMemo(()=>{
        if(!configuration) return null;
        return configuration.programmes || {};
    }, [configuration]);

    let body = useMemo(()=>{
        if(!programs) return <></>;

        if(editValue && configuration) return (
            <ProgramEdit 
                uuid_appareil={uuid_appareil} 
                value={editValue} 
                deviceConfiguration={configuration}
                classLocked={classLocked} 
                saveOnClick={saveOnClick}
                close={programEditClose} 
                onChange={configurationOnChange} />
        );

        return (
            <ProgramList 
                programs={programs} 
                setEditValue={setEditValue} 
                setClassLocked={setClassLocked} 
                removeProgram={removeProgram} />
        );
    }, [editValue, classLocked, configuration, configurationOnChange, programEditClose, programs, removeProgram, saveOnClick, uuid_appareil]);

    return (
        <>
            <nav>
                <Link to={`/apps/senseurspassifs/device/${uuid_appareil}`}
                    className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        Back
                </Link>
            </nav>

            <h1 className='font-bold text-lg pt-2 pb-4'>Programs</h1>

            {body}
        </>
    );
}

type ProgramListType = {
    programs?: ProgramsConfiguration,
    setEditValue: (value: EditValue)=>void,
    removeProgram: (value: MouseEvent<HTMLButtonElement>)=>void,
    setClassLocked: Dispatch<boolean>,
}

function ProgramList(props: ProgramListType) {

    let { programs, setEditValue, setClassLocked, removeProgram } = props;

    let sortedList = useMemo(()=>{
        if(!programs) return null;
        let list = Object.values(programs);
        list.sort(programSort);
        return list;
    }, [programs]);

    let newEditValue = useCallback(()=>{
        setEditValue({
            configuration: {
                programme_id: ''+uuidv1(),
                actif: true,
                class: '',
            }
        })
        setClassLocked(false);
    }, [setEditValue, setClassLocked]);

    let selectProgram = useCallback((e: MouseEvent<HTMLButtonElement>)=>{
        let value = e.currentTarget.value;
        let program = programs?programs[value]:undefined;
        if(program) {
            setEditValue({configuration: program});
        } else {
            console.warn("No match for program id ", value);
        }
    }, [programs, setEditValue]);

    if(!sortedList) return <></>;  // Empty list

    let list = sortedList.map(item=>{
        return (
            <ProgramSummaryItem key={item.programme_id} value={item} select={selectProgram} remove={removeProgram} />
        )
    });

    return (
        <section className='grid grid-cols-12 pb-4'>
            <h2 className='col-span-12 font-bold'>List of programs</h2>
            {list}
            <div className='col-span-12'>
                <button onClick={newEditValue}
                    className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        Add new program
                </button>
            </div>
        </section>

    );
}

type ProgramSummaryItemType = {
    value: ProgramConfiguration,
    select: (e: MouseEvent<HTMLButtonElement>)=>void,
    remove: (e: MouseEvent<HTMLButtonElement>)=>void,
};

function ProgramSummaryItem(props: ProgramSummaryItemType) {

    let { value, select, remove } = props;

    let [description, active] = useMemo(()=>{
        let description = value.descriptif || value.programme_id;
        let active;
        if(value.actif) {
            active = <span>ON</span>;
        } else {
            active = <span>OFF</span>;
        }
        return [description, active];
    }, [value]);

    let className = value.class.split('.').pop();

    return (
        <>
            <div>
                <button onClick={select} value={value.programme_id}
                    className='varbtn w-8 inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        <i className='fa fa-edit'/>
                </button>
            </div>
            <div className='col-span-6'>{description}</div>
            <div className='col-span-3'>{className}</div>
            
            <div>{active}</div>
            <div>
                <button onClick={remove} value={value.programme_id}
                    className='varbtn w-8 inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                    <i className='fa fa-close'/>
                </button>
            </div>
        </>
    )
}

function programSort(a: ProgramConfiguration, b: ProgramConfiguration) {
    let valA = a.descriptif || a.programme_id;
    let valB = b.descriptif || b.programme_id;
    return valA.localeCompare(valB);
}

type ProgramEditType = {
    uuid_appareil: string,
    value: EditValue,
    deviceConfiguration: DeviceConfiguration,
    classLocked: boolean,
    onChange: (e: ProgramConfiguration)=>void,
    saveOnClick: ()=>void,
    close: ()=>void,
}

function ProgramEdit(props: ProgramEditType) {
    let { uuid_appareil, value, saveOnClick, classLocked, onChange, close } = props;
    let configuration = value.configuration;

    let [hasChanged, setHasChanged] = useState(false);

    let descriptionOnChange = useCallback((e: ChangeEvent<HTMLInputElement>)=>{
        if(!configuration) throw new Error("Configuration not initialized");
        let update = {...configuration, descriptif: e.currentTarget.value};
        onChange(update);
        setHasChanged(true);
    }, [configuration, setHasChanged, onChange]);

    let programClassOnChange = useCallback((e: ChangeEvent<HTMLSelectElement>)=>{
        if(!configuration) throw new Error("Configuration not initialized");
        let update = {...configuration, class: e.currentTarget.value};
        onChange(update);
        setHasChanged(true);
    }, [configuration, setHasChanged, onChange]);

    let programActiveOnChange = useCallback((value: boolean)=>{
        if(!configuration) throw new Error("Configuration not initialized");
        let update = {...configuration, actif: value};
        onChange(update);
        setHasChanged(true);
    }, [configuration, setHasChanged, onChange]);

    let ready = useConnectionStore(state=>state.connectionAuthenticated);
 
    if(!configuration) return <></>;

    return (
        <>
            <h2 className='text-bold'>Edit program</h2>

            <div className='grid grid-cols-12'>

                <div className='col-span-2'>Description</div>
                <div className='col-span-6'>
                    <input value={configuration.descriptif} onChange={descriptionOnChange} className='text-black w-full' />
                </div>
                <div className='col-span-4'></div>

                <div className='col-span-2'>Type</div>
                <div className='col-span-6'>
                    {classLocked?
                        <ProgramNameFromList value={configuration.class} />
                    :
                        <ProgramSelectList value={configuration.class} onChange={programClassOnChange} />
                    }
                </div>
                <div className='col-span-4'></div>

                <div className='col-span-2'>Active</div>
                <div className='col-span-6'>
                    <SwitchButtonBoolean value={configuration.actif} onChange={programActiveOnChange} />
                </div>
                <div className='col-span-4'></div>

                <ConfigureProgramClass uuid_appareil={uuid_appareil} configuration={configuration} onChange={onChange} setHasChanged={setHasChanged} />

            </div>

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
        </>
    );
}

type ProgramSelectListType = {
    value: string,
    onChange: (e: ChangeEvent<HTMLSelectElement>)=>void,
};

function ProgramSelectList(props: ProgramSelectListType) {
    let { value, onChange } = props;
    return (
        <select value={value} onChange={onChange} className='text-black w-full'>
            <option>Select a program type</option>
            <ProgramOptions />
        </select>
    )
}

function ProgramOptions() {
    const programmes = getAvailablePrograms()
    let list = programmes.map(item=>{
        return (
            <option key={item.nom} value={item['class']||''}>{item.nom}</option>
        )
    });
    return <>{list}</>;
}

function ProgramNameFromList(props: {value: string}) {
    const { value } = props;

    const programmes = getAvailablePrograms();

    const programmesFiltres = programmes.filter(item=>item.class===value);

    const programme = programmesFiltres.pop();
    if(programme) {
        return <span>{programme.nom}</span>;
    }
    return <></>;
}

function getAvailablePrograms() {
    return [
        { nom: 'Humidificateur', 'class': 'programmes.environnement.Humidificateur' },
        { nom: 'Horaire', 'class': 'programmes.horaire.HoraireHebdomadaire' },
        { nom: 'Timer', 'class': 'programmes.horaire.Timer' },
        { nom: 'Chauffage', 'class': 'programmes.environnement.Chauffage' },
        { nom: 'Climatisation/Refrigeration', 'class': 'programmes.environnement.Climatisation' },
    ]
}

type SwitchButtonProps = { value: boolean, onChange: (value: boolean)=>void, name?: string, idx?: number};

export function SwitchButtonBoolean(props: SwitchButtonProps) {

    let {value, onChange, name, idx} = props;

    let toggleSwitchHandler = useCallback(()=>{
        onChange(!value);
    }, [value, onChange])

    return (
        <label className="inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" checked={value} onChange={toggleSwitchHandler} name={name} data-idx={''+idx} />
            <div 
                className="
                    relative w-11 h-6 bg-gray-300 
                    peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 
                    dark:peer-focus:ring-blue-800 
                    rounded-full 
                    peer dark:bg-gray-700 peer-checked:after:translate-x-full 
                    rtl:peer-checked:after:-translate-x-full 
                    peer-checked:after:border-white after:content-[''] 
                    after:absolute after:top-[2px] after:start-[2px] 
                    after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all 
                    dark:border-gray-600 peer-checked:bg-blue-600 
                    disabled:bg-gray-600 peer-disabled:bg-slate-600">
            </div>
        </label>
    )
    // <input type='checkbox' id={'check'+senseurId} checked={value===1} onChange={toggleSwitchHandler} disabled={toggling} /> 
}

type SwitchButton2Props = { name?: string, idx?: number, value: boolean, onChange: (value: ChangeEvent<HTMLInputElement>)=>void };

export function SwitchButton2(props: SwitchButton2Props) {

    let {name, idx, value, onChange} = props;

    return (
        <label className="inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" checked={value} onChange={onChange} name={name} data-idx={''+idx} />
            <div 
                className="
                    relative w-11 h-6 bg-gray-300 
                    peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 
                    dark:peer-focus:ring-blue-800 
                    rounded-full 
                    peer dark:bg-gray-700 peer-checked:after:translate-x-full 
                    rtl:peer-checked:after:-translate-x-full 
                    peer-checked:after:border-white after:content-[''] 
                    after:absolute after:top-[2px] after:start-[2px] 
                    after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all 
                    dark:border-gray-600 peer-checked:bg-blue-600 
                    disabled:bg-gray-600 peer-disabled:bg-slate-600">
            </div>
        </label>
    )
    // <input type='checkbox' id={'check'+senseurId} checked={value===1} onChange={toggleSwitchHandler} disabled={toggling} /> 
}

type ConfigureProgramClassType = {
    uuid_appareil: string,
    configuration: ProgramConfiguration,
    onChange: (value: ProgramConfiguration)=>void,
    setHasChanged: Dispatch<boolean>,
}

function ConfigureProgramClass(props: ConfigureProgramClassType) {

    const { uuid_appareil, configuration, onChange, setHasChanged } = props;

    let programClass = configuration.class;
    let ProgramEditorClass = null as null | ((props: ProgramEditorParametersType) => JSX.Element) ;

    switch(programClass) {
        case 'programmes.environnement.Humidificateur': ProgramEditorClass = HumidificatorProgramEditor; break
        case 'programmes.environnement.Chauffage':
        case 'programmes.environnement.Climatisation':
            ProgramEditorClass = TemperatureProgramEditor; 
            break;
        case 'programmes.horaire.HoraireHebdomadaire': ProgramEditorClass = WeeklyScheduleProgramEditor; break
        default: ProgramEditorClass = EditUnsupportedProgram;
    }

    return <ProgramEditorClass uuid_appareil={uuid_appareil} configuration={configuration} onChange={onChange} setHasChanged={setHasChanged} />;
}

export type ProgramEditorParametersType = ConfigureProgramClassType;

function EditUnsupportedProgram() {
    return <div className='col-span-12 pt-6'>Unsupported program type.</div>
}
