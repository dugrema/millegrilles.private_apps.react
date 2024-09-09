import { useCallback } from "react";
import GroupPicklist from "./GroupPicklist";
import useNotepadStore from "./notepadStore";
import { useNavigate } from "react-router-dom";

function NotepadMainPage() {
    return (
        <>
            <h1 className='font-bold text-lg pb-4'>Notepad</h1>


            <section>
                <h2 className='font-bold pt-4 pb-2'>Edit</h2>
                <div className='grid grid-cols-6'>
                    <button className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>Categories</button>
                    <button className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>Groups</button>
                </div>
            </section>

            <section>
                <h2 className='font-bold pt-4 pb-2'>Groups</h2>
                <GroupPickListSection />
            </section>
        </>
    )
}

export default NotepadMainPage;

function GroupPickListSection() {

    let navigate = useNavigate();
    let syncDone = useNotepadStore(state=>state.syncDone);

    let groupOnChange = useCallback((group: string)=>{
        if(!group) return;
        navigate(`/apps/notepad/group/${group}`);
    }, [navigate]);

    if(!syncDone) return (
        <p>Loading data</p>
    );

    return (
        <>
            <p className='pb-2'>Pick a group.</p>
            <div className='grid grid-cols-4'>
                <GroupPicklist onChange={groupOnChange} />
            </div>
        </>
    )
}
