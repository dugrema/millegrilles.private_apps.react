import { useState, useEffect } from 'react'
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    TimeScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { Line } from 'react-chartjs-2';

import { formatData } from './formatDataCharts';

ChartJS.register(
    CategoryScale,
    LinearScale,
    TimeScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
);

const CONST_OPTIONS_HEURES = {
    plugins: {legend: {display: false}},
    scales: {
        x: {
            type: 'time',
            time: {
                unit: 'hour',
                tooltipFormat: 'yyyy-MM-dd hh:mm',
                displayFormats: { hour: 'HH:mm' }
            },
        },
        xSub: {
            type: 'time',
            time: { unit: 'day', displayFormats: { day: 'yyyy-MM-dd' } },
        },        
        y: { title: {display: true, text: 'Temperature (C)'} },
    }
}

const CONST_OPTIONS_JOURS = {
    plugins: {legend: {display: false}},
    scales: {
        x: {
            type: 'time',
            time: {
                unit: 'day',
                tooltipFormat: 'yyyy-MM-dd',
                displayFormats: { day: 'dd' }
            },
        },
        xSub: {
            type: 'time',
            time: { unit: 'month', displayFormats: { month: 'MMM yyyy' } },
        },        
        y: { title: {display: true, text: 'Temperature (C)'} },
    }
}

export default function ChartTemperatures(props) {

    const { value } = props
    const className = props.className
    const unite = props.unite || 'jours'

    const [options, setOptions] = useState('')
    const [data, setData] = useState('')

    useEffect(()=>{
        const [labels, datasets] = formatData(value)
        
        switch(unite) {
            case 'heures': setOptions(CONST_OPTIONS_HEURES); break
            default: setOptions(CONST_OPTIONS_JOURS)
        }

        setData({labels, datasets})
    }, [value, unite])

    if(!data) return <></>;

    return (
        <div className={className}>
            <Line 
                options={options} 
                data={data} />
        </div>
    )
}

