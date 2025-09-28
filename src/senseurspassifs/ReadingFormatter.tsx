import { JSX, useCallback } from 'react';
import useWorkers from '../workers/workers';
import { DeviceReadings } from './senseursPassifsStore';

type ReadingFormatterProps = {
    value: number | string,
    type?: string | null,
    hideType?: boolean,
}

export default function ReadingFormatter(props: ReadingFormatterProps): JSX.Element {
    const {value, type, hideType} = props

    if(typeof(value) !== 'number') return <span>{value}</span>
    if(value === undefined || isNaN(value)) return <span></span>

    if(type === 'switch') {
        if(value === 1.0) return <span>ON</span>
        if(value === 0.0) return <span>OFF</span>
        const valeurPct = ''+Math.floor(value*100)
        return <span>{valeurPct}%</span>
    }

    let [decimals, unit] = getUnit(type);
    if(hideType) unit = <span></span>

    if(value !== null && decimals !== null) {
        return <span>{value.toFixed(decimals)}{unit}</span>
    } else {
        return <span>{value}{unit}</span>
    }
}

function getUnit(type?: string | null): [number | null, JSX.Element] {
    let decimals = null, unit = <span></span>
    switch(type) {
        case 'temperature': decimals = 1; unit = <span>&deg;C</span>; break
        case 'humidite': decimals = 1; unit = <span>%</span>; break
        case 'pression': decimals = 0; unit = <span> hPa</span>; break
        case 'pression_tendance': decimals = 0; unit = <span> Pa</span>; break
        default:
    }
    return [decimals, unit]
}

type SwitchButtonProps = {
    device: DeviceReadings,
    senseurId: string,
    value: string | number,
    toggling: boolean,
    startTogglingCb: () => void,
};

export function SwitchButton(props: SwitchButtonProps) {

    let {device, senseurId, value, toggling, startTogglingCb} = props;
    let { instance_id, uuid_appareil } = device;

    let workers = useWorkers();
    let deviceConnected = device.connecte;

    let toggleSwitchHandler = useCallback(()=>{
        if(!workers) throw new Error("Workers not initialized");

        let toggleValeur = value?0:1
        let command = { 
            instance_id, uuid_appareil, senseur_id: senseurId, 
            valeur: toggleValeur,
            commande_action: 'setSwitchValue'
        }
        startTogglingCb();
        workers.connection.deviceCommand(command)
            .catch(err=>console.error("SwitchButton.toggleSwitchHandler Error ", err));
    }, [workers, instance_id, uuid_appareil, senseurId, value, startTogglingCb])

    return (
        <label className="inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" checked={value===1} onChange={toggleSwitchHandler} disabled={toggling||!deviceConnected} />
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
