export function formatData(data) {
    const labels = []
    const datasetMoyenne = []
    const datasetMinimum = []
    const datasetMaximum = []

    for (const datapoint of data) {
        const dateVal = datapoint.jour || datapoint.heure
        const dateInst = new Date(dateVal*1000)
        labels.push(dateInst)
        datasetMoyenne.push(datapoint.avg)
        datasetMinimum.push(datapoint.min)
        datasetMaximum.push(datapoint.max)
    }

    const datasets = [
        {
            label: 'min',
            data: datasetMinimum,
            borderColor: 'blue',
            backgroundColor: 'blue',
        },
        {
            label: 'moy',
            data: datasetMoyenne,
            borderColor: 'grey',
            backgroundColor: 'black',
        },
        {
            label: 'max',
            data: datasetMaximum,
            borderColor: 'red',
            backgroundColor: 'red',
        },        
    ]

    return [labels, datasets]
}
