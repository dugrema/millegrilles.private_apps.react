import { ChangeEvent, useCallback, useMemo, useState } from "react";
import useNotepadStore from "./notepadStore";

type GroupPicklistType = {
    onChange: (groupId: string) => void,
}

function GroupPicklist(props: GroupPicklistType) {

    let { onChange } = props;

    let groups = useNotepadStore(state=>state.groups);
    
    let [selectedGroup, setSelectedGroup] = useState('');
    
    let groupsElems = useMemo(()=>{
        if(!groups) return [];
        return groups.map(group=>{
            return (
                <option key={group.groupe_id} value={group.groupe_id}>{group.data?.nom_groupe}</option>
            )
        });
    }, [groups]);

    let groupOnChange = useCallback((e: ChangeEvent<HTMLSelectElement>)=>{
        let value = e.currentTarget.value;
        console.debug("currentTarget", e.currentTarget);
        setSelectedGroup(value);
        onChange(value);
    }, [setSelectedGroup, onChange]);

    return (
        <>
            <label>Groups</label>
            <select value={''+selectedGroup} onChange={groupOnChange}
                className='text-black'>
                    <option>Pick a group</option>
                    {groupsElems}
            </select>
        </>
    )
}

export default GroupPicklist;
