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
        case 'pression': decimals = 0; unit = <span>hPa</span>; break
        case 'pression_tendance': decimals = 0; unit = <span>Pa</span>; break
        default:
    }
    return [decimals, unit]
}
