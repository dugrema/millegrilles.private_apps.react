import { useMemo } from "react";
import { sortGroups } from "./GroupPicklist";
import useNotepadStore from "./notepadStore";
import { Link } from "react-router-dom";

function NotepadMainPage() {
    return (
        <>
            <h1 className='font-bold text-lg pb-4'>Notepad</h1>

            <section>
                <h2 className='font-bold pt-4 pb-2'>Edit</h2>
                <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6'>
                    <button className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>Categories</button>
                    <button className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>Groups</button>
                </div>
            </section>

            <section>
                <h2 className='font-bold pt-4 pb-2'>Groups</h2>
                <DisplayGroupsSection />
            </section>
        </>
    )
}

export default NotepadMainPage;

function DisplayGroupsSection() {

    let syncDone = useNotepadStore(state=>state.syncDone);
    let groups = useNotepadStore(state=>state.groups);

    let sortedGroups = useMemo(()=>{
        let sortedGroups = [...groups];
        sortedGroups.sort(sortGroups);
        return sortedGroups;
    }, [groups]);

    if(!syncDone) return (
        <p>Loading data</p>
    );

    return (
        <>
            <nav className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 pl-2 gap-x-3 pr-4'>
                {sortedGroups.map(group=>{
                    return (
                        <Link key={group.groupe_id} to={`/apps/notepad/group/${group.groupe_id}`}
                            className='varbtn underline font-bold block w-full bg-indigo-800 hover:bg-indigo-600 active:bg-indigo-500 disabled:bg-indigo-900 pt-1 pb-1 pl-2 pr-2'>
                                {group.data?.nom_groupe}
                        </Link>
                    );
                })}
            </nav>
        </>
    )
}