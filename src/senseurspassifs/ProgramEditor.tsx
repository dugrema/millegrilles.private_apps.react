import { ChangeEvent, Fragment, MouseEvent, useCallback, useMemo } from "react";
import { DeviceComponentPicklistFilter } from "./DevicePicklists";
import { ProgramEditorParametersType, SwitchButton2, SwitchButtonBoolean } from "./EditDevicePrograms";
import { SwitchButton } from "./ReadingFormatter";

type HumidificatorProgramArgsType = {
    senseurs_humidite: Array<string>,
    switches_humidificateurs: Array<string>,
    humidite: number,
    precision: number,
    duree_off_min: number,
    duree_on_min: number,
};

type TemperatureProgramArgsType = {
    senseurs: Array<string>,
    switches: Array<string>,
    temperature: number,
    precision: number,
    duree_off_min: number,
    duree_on_min: number,
};

type ScheduleEntryType = {
    etat: number,
    heure?: number,
    minute?: number,
    jour?: number,
    solaire?: string,
}

type ScheduleProgramArgsType = {
    activationInitiale?: boolean,
    switches?: Array<string>,
    horaire?: Array<ScheduleEntryType>,
};

export function HumidificatorProgramEditor(props: ProgramEditorParametersType) {

    let { uuid_appareil, configuration, onChange, setHasChanged } = props;

    let [args, senseur_humidite, switch_humidificateur] = useMemo(()=>{
        let args = configuration.args as HumidificatorProgramArgsType;
        if(!args) {
            // Init
            args = {
                senseurs_humidite: [],
                switches_humidificateurs: [],
                humidite: 50,
                precision: 2,
                duree_off_min: 30,
                duree_on_min: 90,
            };
        }
        let senseur_humidite = args.senseurs_humidite[0];
        let switch_humidificateur = args.switches_humidificateurs[0];

        return [args, senseur_humidite, switch_humidificateur];
    }, [configuration]);

    let sensorOnChange = useCallback((e: ChangeEvent<HTMLSelectElement>)=>{
        let value = e.currentTarget.value;
        let argsUpdated = {...args};
        argsUpdated.senseurs_humidite = [value];
        onChange({...configuration, args: argsUpdated});
        setHasChanged(true);
    }, [configuration, args, onChange, setHasChanged]);

    let switchOnChange = useCallback((e: ChangeEvent<HTMLSelectElement>)=>{
        let value = e.currentTarget.value;
        let argsUpdated = {...args};
        argsUpdated.switches_humidificateurs = [value];
        onChange({...configuration, args: argsUpdated});
        setHasChanged(true);
    }, [configuration, args, onChange, setHasChanged]);

    let numberOnChange = useCallback((e: ChangeEvent<HTMLInputElement>)=>{
        let name = e.currentTarget.name;
        let value = Number.parseInt(e.currentTarget.value);
        let argsUpdated = {...args};
        // @ts-ignore
        argsUpdated[name] = value;
        onChange({...configuration, args: argsUpdated});
        setHasChanged(true);
    }, [configuration, args, onChange, setHasChanged]);

    return (
        <>
            <div className='col-span-2'>Sensor</div>
            <div className='col-span-10'>
                <DeviceComponentPicklistFilter 
                    uuid_appareil={uuid_appareil} 
                    value={senseur_humidite} 
                    onChange={sensorOnChange}
                    typeFilter="humidite" />
            </div>
            <div className='col-span-2'>Switch</div>
            <div className='col-span-10'>
                <DeviceComponentPicklistFilter 
                    uuid_appareil={uuid_appareil} 
                    value={switch_humidificateur} 
                    onChange={switchOnChange} 
                    typeFilter="switch" 
                    localOnly={true} />
            </div>
            <div className='col-span-2'>Humidity (%)</div>
            <div className='col-span-10'>
                <input type="number" min={0} max={100} name='humidite' value={args.humidite} onChange={numberOnChange}
                    className='text-black w-24' />
            </div>
            <div className='col-span-2'>Precision (+/-)</div>
            <div className='col-span-10'>
                <input type="number" min={0} max={100} name='precision' value={args.precision} onChange={numberOnChange}
                    className='text-black w-24' />                
            </div>
            <div className='col-span-2'>ON minimum duration (seconds)</div>
            <div className='col-span-10'>
                <input type="number" min={0} max={1800} name='duree_on_min' value={args.duree_on_min} onChange={numberOnChange}
                    className='text-black w-24' />                
            </div>
            <div className='col-span-2'>OFF minimum duration (seconds)</div>
            <div className='col-span-10'>
                <input type="number" min={0} max={1800} name='duree_off_min' value={args.duree_off_min} onChange={numberOnChange}
                    className='text-black w-24' />                
            </div>
        </>
    )
}

export function TemperatureProgramEditor(props: ProgramEditorParametersType) {

    let { uuid_appareil, configuration, onChange, setHasChanged} = props;

    let [args, sensor, componentSwitch] = useMemo(()=>{
        let args = configuration.args as TemperatureProgramArgsType;
        if(!args) {
            // Init
            args = {
                senseurs: [],
                switches: [],
                temperature: 20,
                precision: 2,
                duree_off_min: 30,
                duree_on_min: 90,
            };
        }
        let sensor = args.senseurs[0];
        let switchComponent = args.switches[0];

        return [args, sensor, switchComponent];
    }, [configuration]);

    let sensorOnChange = useCallback((e: ChangeEvent<HTMLSelectElement>)=>{
        let value = e.currentTarget.value;
        let argsUpdated = {...args};
        argsUpdated.senseurs = [value];
        onChange({...configuration, args: argsUpdated});
        setHasChanged(true);
    }, [configuration, args, onChange, setHasChanged]);

    let switchOnChange = useCallback((e: ChangeEvent<HTMLSelectElement>)=>{
        let value = e.currentTarget.value;
        let argsUpdated = {...args};
        argsUpdated.switches = [value];
        onChange({...configuration, args: argsUpdated});
        setHasChanged(true);
    }, [configuration, args, onChange, setHasChanged]);

    let numberOnChange = useCallback((e: ChangeEvent<HTMLInputElement>)=>{
        let name = e.currentTarget.name;
        let value = Number.parseInt(e.currentTarget.value);
        let argsUpdated = {...args};
        // @ts-ignore
        argsUpdated[name] = value;
        onChange({...configuration, args: argsUpdated});
        setHasChanged(true);
    }, [configuration, args, onChange, setHasChanged]);

    return (
        <>
            <div className='col-span-2'>Sensor</div>
            <div className='col-span-10'>
                <DeviceComponentPicklistFilter 
                    uuid_appareil={uuid_appareil} 
                    value={sensor} 
                    onChange={sensorOnChange}
                    typeFilter="temperature" />
            </div>
            <div className='col-span-2'>Switch</div>
            <div className='col-span-10'>
                <DeviceComponentPicklistFilter 
                    uuid_appareil={uuid_appareil} 
                    value={componentSwitch} 
                    onChange={switchOnChange} 
                    typeFilter="switch" 
                    localOnly={true} />
            </div>
            <div className='col-span-2'>Temperature (C)</div>
            <div className='col-span-10'>
                <input type="number" min={-50} max={50} name='temperature' value={args.temperature} onChange={numberOnChange}
                    className='text-black w-24' />
            </div>
            <div className='col-span-2'>Precision (+/-)</div>
            <div className='col-span-10'>
                <input type="number" min={0} max={100} name='precision' value={args.precision} onChange={numberOnChange}
                    className='text-black w-24' />                
            </div>
            <div className='col-span-2'>ON minimum duration (seconds)</div>
            <div className='col-span-10'>
                <input type="number" min={0} max={1800} name='duree_on_min' value={args.duree_on_min} onChange={numberOnChange}
                    className='text-black w-24' />                
            </div>
            <div className='col-span-2'>OFF minimum duration (seconds)</div>
            <div className='col-span-10'>
                <input type="number" min={0} max={1800} name='duree_off_min' value={args.duree_off_min} onChange={numberOnChange}
                    className='text-black w-24' />                
            </div>
        </>
    )
}

export function WeeklyScheduleProgramEditor(props: ProgramEditorParametersType) {

    let { uuid_appareil, configuration, onChange, setHasChanged} = props;

    let [args, componentSwitch, schedule] = useMemo(()=>{
        let args = configuration.args as ScheduleProgramArgsType;
        if(!args) {
            // Init
            args = {
                activationInitiale: false,
                switches: [],
                horaire: [],
            };
        }
        let switchComponent = args.switches?args.switches[0]:null;
        let horaire = args.horaire || [];

        return [args, switchComponent, horaire];
    }, [configuration]);

    let switchOnChange = useCallback((e: ChangeEvent<HTMLSelectElement>)=>{
        let value = e.currentTarget.value;
        let argsUpdated = {...args};
        argsUpdated.switches = [value];
        onChange({...configuration, args: argsUpdated});
        setHasChanged(true);
    }, [configuration, args, onChange, setHasChanged]);

    let checkOnRestartToggle = useCallback((value: boolean) => {
        let argsUpdated = {...args};
        argsUpdated.activationInitiale = value;
        onChange({...configuration, args: argsUpdated});
        setHasChanged(true);
    }, [onChange, setHasChanged, args]);

    let addLineHandler = useCallback(()=>{
        let argsUpdated = {...args};
        let lines = argsUpdated.horaire?[...argsUpdated.horaire]:[];
        lines.push({etat: 1, heure: 8, minute: 0});
        argsUpdated.horaire = lines;
        onChange({...configuration, args: argsUpdated});
        setHasChanged(true);
    }, [configuration, onChange]);

    let removeLineHandler = useCallback((e: MouseEvent<HTMLButtonElement>)=>{
        let idx = Number.parseInt(e.currentTarget.value);
        let argsUpdated = {...args};
        let lines = argsUpdated.horaire;
        if(!lines) return;  // Nothing to delete

        lines = [...lines];  // Copy
        lines.splice(idx, 1);
        argsUpdated.horaire = lines;

        onChange({...configuration, args: argsUpdated});
        setHasChanged(true);        
    }, [configuration, onChange]);

    let scheduleOnChange = useCallback((e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        let { name, value } = e.currentTarget;
        // @ts-ignore
        let checked = e.currentTarget.checked;
        let idxStr = e.currentTarget.dataset.idx;
        if(!idxStr) throw new Error("idx missing");
        let idx = Number.parseInt(idxStr);

        let argsUpdated = {...args};
        let line = argsUpdated?.horaire?argsUpdated?.horaire[idx]:null;
        if(!line) throw new Error("Line missing");

        if(name === 'state') {
            // Checkbox
            line.etat = checked?1:0;
        } else if(name === 'solar') {
            line.solaire = value;
        } else {
            if(value === '' || value === '-') {
                // @ts-ignore
                line[name] = value;
            } else {
                // Numeric value
                let numberValue = Number.parseInt(value);
                if(isNaN(numberValue)) throw new Error("Invalid number value");
                // @ts-ignore
                line[name] = numberValue;
            }
        }

        onChange({...configuration, args: argsUpdated});
        setHasChanged(true);
    }, [configuration, args, onChange, setHasChanged]);

    return (
        <>
            <div className='col-span-2'>Switch</div>
            <div className='col-span-10'>
                <DeviceComponentPicklistFilter 
                    uuid_appareil={uuid_appareil} 
                    value={componentSwitch || ''} 
                    onChange={switchOnChange} 
                    typeFilter="switch" 
                    localOnly={true} />
            </div>
            <div className='col-span-2'>Check on restart</div>
            <div className='col-span-10'>
                <SwitchButtonBoolean value={!!args.activationInitiale} onChange={checkOnRestartToggle} />
            </div>

            <div className='col-span-12 pt-10'>
                <h2 className='font-bold pb-2'>Schedule program information</h2>
                <ul className='list-disc ml-4'>
                    <li>
                        Options solaires (dawn, sunrise, etc) vont ignorer l'heure. Il faut avoir fourni les coordonnées (géoposition) de l'appareil pour utiliser cette option. Les minutes sont optionnelles et utilisées comme offset (e.g. levé du soleil +10 minutes).
                    </li>
                    <li>
                        Les jours de la semaine sont programmables un par un. Pour avoir un horaire du lundi au vendredi, il faut programmer chaque jour séparément. Noter que pour une lumière, il est possible de la faire fermer tous les jours mais juste allumer certains jours.
                    </li>
                    <li>L'ordre des lignes n'a pas d'importance.</li>
                    <li>
                        L'activation initiale au redémarrage détermine si la switch devrait être ON ou OFF lors du démarrage de l'appareil. Utile en cas de panne de courant.
                    </li>
                </ul>
            </div>

            <>
                <div className='col-span-3 pt-6'>Day</div>
                <div className='col-span-3 pt-6'>Solar</div>
                <div className='col-span-1 pt-6'>On/Off</div>
                <div className='col-span-1 pt-6'>Hour</div>
                <div className='col-span-1 pt-6'>Minute</div>
                <div className='col-span-2 pt-6'></div>
                <div className='col-span-1 pt-6'>Remove</div>
            </>

            <WeeklyScheduleLines value={schedule} onChange={scheduleOnChange} onRemove={removeLineHandler} />

            <div className='col-span-12 text-center pt-4'>
                <button onClick={addLineHandler}
                    className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        + Add line
                </button>
            </div>
        </>
    )
}

type WeeklyScheduleLinesProps = {
    value: Array<ScheduleEntryType>,
    onChange: (e: ChangeEvent<HTMLSelectElement | HTMLInputElement>)=>void,
    onRemove: (e: MouseEvent<HTMLButtonElement>)=>void,
};

function WeeklyScheduleLines(props: WeeklyScheduleLinesProps) {

    let { value, onChange, onRemove } = props;

    let lines = useMemo(()=>value.map((item, idx)=>{
        let { etat, jour, solaire, heure, minute } = item;

        let minMinute = 0, maxMinute = 59;
        let showHour = true;
        
        if(solaire) {
            showHour = false;
            minMinute = -60;
            maxMinute = 60;
        }
        
        let hourClassName = showHour?'':' hidden';

        return (
            <Fragment key={''+idx}>
                <div className='col-span-3'><SelectDayOfWeek idx={idx} value={''+jour} onChange={onChange} /></div>
                <div className='col-span-3'><SelectHeureSolaire idx={idx} value={''+solaire} onChange={onChange} /></div>
                <div className='col-span-1'>
                    <SwitchButton2 name='state' idx={idx} onChange={onChange} value={etat===1} />
                </div>
                <div className='col-span-1'>
                    <input type='number' min={0} max={23} name='heure' data-idx={idx} value={''+heure} onChange={onChange} disabled={!showHour} 
                        className={'text-black w-18 ' + hourClassName} />
                </div>
                <div className='col-span-1'>
                    <input type='number' min={minMinute} max={maxMinute} name='minute' data-idx={idx} value={''+minute} onChange={onChange} 
                        className='text-black w-20' />
                </div>
                <div className='col-span-2'></div>
                <div className='col-span-1'>
                    <button onClick={onRemove} value={''+idx}
                        className='varbtn w-8 mt-0 inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        <i className='fa fa-close'/>
                    </button>
                </div>
            </Fragment>
        );

    }), [value, onChange]);

    return (
        <>{lines}</>
    )

}

// Aligner sur Python - monday=0, sunday=6
const CONST_DAY_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

type ScheduleTimeProps = {
    idx: number, 
    value: string, 
    onChange: (e: ChangeEvent<HTMLSelectElement>)=>void,
};

function SelectDayOfWeek(props: ScheduleTimeProps) {
    const { idx, value, onChange } = props

    const valueStr = value?''+value:''

    const daysOfWeekOptions = CONST_DAY_OF_WEEK.map((item, idx)=>{
        return <option key={''+idx} value={''+idx}>{item}</option>
    })
    return (
        <select name='jour' data-idx={idx} value={valueStr} onChange={onChange} className='text-black'>
            <option value=''>Every day</option>
            {daysOfWeekOptions}
        </select>
    )
}

const CONST_SOLAR_TIMES = ['dawn', 'sunrise', 'noon', 'sunset', 'dusk'];

function SelectHeureSolaire(props: ScheduleTimeProps) {
    const { value, idx, onChange } = props

    const valueStr = value?''+value:''

    const jours = CONST_SOLAR_TIMES.map((item, idx)=>{
        return <option key={''+idx} value={item}>{item}</option>
    })
    return (
        <select name='solar' data-idx={idx} value={valueStr} onChange={onChange} className='text-black'>
            <option value=''>Time</option>
            {jours}
        </select>
    )
}
