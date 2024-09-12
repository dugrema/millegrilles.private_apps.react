import { ChangeEvent, useCallback, useMemo, useState } from "react";
import useNotepadStore from "./notepadStore";
import { NotepadGroupType } from "./idb/notepadStoreIdb";

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

export function sortGroups(a: NotepadGroupType, b: NotepadGroupType, language?: string) {
    language = language || navigator.languages[0] || navigator.language;
    let labelA = (a.data?.nom_groupe || a.groupe_id).toLocaleLowerCase();
    let labelB = (b.data?.nom_groupe || b.groupe_id).toLocaleLowerCase();
    return labelA.localeCompare(labelB, language, {numeric: true, ignorePunctuation: true});
}
