import { useMemo } from "react";
import { sortGroups } from "./GroupPicklist";
import useNotepadStore from "./notepadStore";
import { Link } from "react-router-dom";

function NotepadMainPage() {
    return (
        <>
<h1 className='font-bold text-2xl pb-4'>Notepad</h1>

<section>
    <h2 className='font-semibold text-slate-400 text-sm uppercase tracking-wider pt-4 pb-2'>Management</h2>
    <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3'>
        <Link to='/apps/notepad/categories'
            className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
            Categories
        </Link>
    </div>
</section>

<section>
    <h2 className='font-semibold text-slate-400 text-sm uppercase tracking-wider pt-6 pb-2'>Groups</h2>
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
        <div className="flex items-center justify-center py-8 text-slate-400">
            <div className="animate-pulse">Loading data...</div>
        </div>
    );

    if(groups.length === 0) return (
        <div className="text-center py-12 text-slate-400">
            <i className="fa fa-folder-open text-4xl mb-3 block" />
            <p>No groups found. Create one to get started!</p>
        </div>
    );

    return (
        <>
            <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3 mb-4'>
                <Link to='/apps/notepad/group/new'
                    className='btn inline-block text-center bg-indigo-800 hover:bg-indigo-600 active:bg-indigo-500 disabled:bg-indigo-900'>
                    <i className='fa fa-plus mr-1'/> New
                </Link>
                <Link to='/apps/notepad/restoreGroups'
                    className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                    <i className='fa fa-recycle mr-1'/> Restore
                </Link>
            </div>
            <nav className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3'>
                {sortedGroups.map(group=>{
                    return (
                        <Link key={group.groupe_id} to={`/apps/notepad/group/${group.groupe_id}`}
                            className='varbtn underline font-bold block w-full bg-slate-700 hover:bg-slate-600 active:bg-slate-500 pt-1 pb-1 pl-2 pr-2'>
                            {group.data?.nom_groupe}
                        </Link>
                    );
                })}
            </nav>
        </>
    )
}
