import { useMemo } from "react";
import { sortGroups } from "./GroupPicklist";
import useNotepadStore from "./notepadStore";
import { Link } from "react-router-dom";

function NotepadMainPage() {
    return (
        <div className="p-4 max-w-7xl mx-auto">
            <h1 className='text-2xl font-bold text-white mb-6'>Notepad</h1>

            <section className="mb-8">
                <h2 className='font-semibold text-slate-400 text-sm uppercase tracking-wider mb-4'>Management</h2>
                <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4'>
                    <Link to='/apps/notepad/categories'
                        className='btn flex items-center text-sm bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-md transition-colors shadow-sm'>
                        <i className='fa fa-list-ul mr-2' /> Categories
                    </Link>
                </div>
            </section>

            <section>
                <h2 className='font-semibold text-slate-400 text-sm uppercase tracking-wider mb-4'>Groups</h2>
                <DisplayGroupsSection />
            </section>
        </div>
    );
}

export default NotepadMainPage;

function DisplayGroupsSection() {
    const syncDone = useNotepadStore(state => state.syncDone);
    const groups = useNotepadStore(state => state.groups);

    const sortedGroups = useMemo(() => {
        return [...groups].sort(sortGroups);
    }, [groups]);

    if (!syncDone) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 animate-pulse">
                <i className="fa fa-spinner fa-spin text-3xl mb-4 opacity-20" />
                <p>Loading groups...</p>
            </div>
        );
    }

    if (groups.length === 0) {
        return (
            <div className="text-center py-20 text-slate-400 bg-slate-800/30 rounded-xl border border-dashed border-slate-700">
                <i className="fa fa-folder-open text-5xl mb-4 block opacity-20" />
                <p className="text-lg">No groups found.</p>
                <p className="text-sm text-slate-500 mt-1">Create one to get started!</p>
            </div>
        );
    }

    return (
        <>
            <div className='flex flex-wrap gap-2 mb-6'>
                <Link to='/apps/notepad/group/new'
                    className='btn flex items-center text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-md transition-colors shadow-sm'>
                    <i className='fa fa-plus mr-2' /> New group
                </Link>
                <Link to='/apps/notepad/restoreGroups'
                    className='btn flex items-center text-sm bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-md transition-colors'>
                    <i className='fa fa-recycle mr-2' /> Restore
                </Link>
            </div>
            <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4'>
                {sortedGroups.map(group => (
                    <Link key={group.groupe_id} to={`/apps/notepad/group/${group.groupe_id}`}
                        className='group bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700 hover:border-indigo-500/50 p-4 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md'>
                        <div className="flex flex-col items-center text-center">
                            <div className="w-12 h-12 bg-slate-700 rounded-lg flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-200">
                                <i className="fa fa-folder text-indigo-400 text-xl" />
                            </div>
                            <span className="text-slate-200 font-medium truncate w-full text-sm sm:text-base">
                                {group.data?.nom_groupe || `Group ${group.groupe_id.slice(0, 8)}`}
                            </span>
                        </div>
                    </Link>
                ))}
            </div>
        </>
    );
}
