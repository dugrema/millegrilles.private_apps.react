import { ChangeEvent, Fragment, useEffect, useMemo, useState } from "react";
import useSenseursPassifsStore from "./senseursPassifsStore";

export type DeviceComponentType = { name: string, value: string, type: string };

type DeviceComponentPicklistFilterType = { 
    uuid_appareil: string,
    value: string,
    idx?: number,
    onChange: (e: ChangeEvent<HTMLSelectElement>)=>void,
    typeFilter?: string,
    localOnly?: boolean,
};

type DeviceComponentPicklistType = DeviceComponentPicklistFilterType & { 
    components: Array<DeviceComponentType>, 
};

export function DeviceComponentPicklist(props: DeviceComponentPicklistType) {
    let { uuid_appareil, components, value, onChange, idx, localOnly } = props;

    let options = useMemo(()=>{
        return components.map(item=>{
            let itemValue = item.value;
            if(itemValue.startsWith(uuid_appareil)) {
                itemValue = itemValue.split(':').pop() as string;  // Retirer nom appareil (courant)
            } else if(localOnly) {
                return <Fragment key={item.value}></Fragment>;  // Skip
            }
            return <option key={item.value} value={itemValue}>{item.name}</option>
        });
    }, [uuid_appareil, components, localOnly]);

    return (
        <select value={value} onChange={onChange} data-idx={idx}
            className='text-black disabled:bg-slate-600 w-full'>
                <option>Select a component</option>
                {options}
        </select>
    )
}

export function DeviceComponentPicklistFilter(props: DeviceComponentPicklistFilterType) {
    let [components, setComponents] = useState([] as Array<DeviceComponentType>);

    return (
        <>
            <DeviceComponentPicklist 
                uuid_appareil={props.uuid_appareil} 
                localOnly={props.localOnly}
                value={props.value} 
                idx={props.idx} 
                onChange={props.onChange} 
                components={components} />
            <ComponentListLoader setComponentList={setComponents} typeFilter={props.typeFilter} />
        </>
    )
}

/** Loads a list of all components from devices. Sets the value using setComponentList, updates on changes. */
export function ComponentListLoader(props: {typeFilter?: string, setComponentList: (value: Array<DeviceComponentType>)=>void}) {
    
    let { typeFilter, setComponentList } = props;

    let devices = useSenseursPassifsStore(state=>state.devices);

    useEffect(()=>{
        const componentList = [] as Array<DeviceComponentType>;
        for(const device of Object.values(devices)) {
            const configuration = device.configuration || {};
            const deviceName = configuration.descriptif || device.uuid_appareil;
            const componentDescription = configuration.descriptif_senseurs || {};
            const components = device.senseurs;
            if(components) {
                for(const componentName of Object.keys(components)) {
                    const componentLabel = componentDescription[componentName] || componentName;
                    const name = deviceName + ' ' + componentLabel;
                    const value = device.uuid_appareil + ":" + componentName;
                    const componentType = components[componentName].type;

                    if(!typeFilter || typeFilter === componentType) {
                        componentList.push({name, value, type: componentType});
                    }
                }
            }
        }

        componentList.sort(sortComponents);

        setComponentList(componentList);
    }, [devices, setComponentList, typeFilter]);
    
    return <></>;
}

export function sortComponents(a: DeviceComponentType, b: DeviceComponentType) {
    return a.name.localeCompare(b.name);
}
