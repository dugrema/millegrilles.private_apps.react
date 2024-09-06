import { ChangeEvent, useCallback, useMemo } from "react";
import { DeviceComponentPicklistFilter } from "./DevicePicklists";
import { ProgramEditorParametersType } from "./EditDevicePrograms";

type HumidificatorProgramArgsType = {
    senseurs_humidite: Array<string>,
    switches_humidificateurs: Array<string>,
    humidite: number,
    precision: number,
    duree_off_min: number,
    duree_on_min: number,
};

export function HumidificatorProgramEditor(props: ProgramEditorParametersType) {

    let { uuid_appareil, configuration, onChange } = props;

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
    }, [configuration, args, onChange]);

    let switchOnChange = useCallback((e: ChangeEvent<HTMLSelectElement>)=>{
        let value = e.currentTarget.value;
        let argsUpdated = {...args};
        argsUpdated.switches_humidificateurs = [value];
        onChange({...configuration, args: argsUpdated});
    }, [configuration, args, onChange]);

    let numberOnChange = useCallback((e: ChangeEvent<HTMLInputElement>)=>{
        let name = e.currentTarget.name;
        let value = Number.parseInt(e.currentTarget.value);
        let argsUpdated = {...args};
        // @ts-ignore
        argsUpdated[name] = value;
        onChange({...configuration, args: argsUpdated});
    }, [configuration, args, onChange]);

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
