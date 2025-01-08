import { Link } from "react-router-dom";
import useUserBrowsingStore from "./userBrowsingStore";
import { MouseEvent, useCallback, useMemo } from "react";
import { Formatters } from "millegrilles.reactdeps.typescript";

type BreadcrumbProps = {
    root?: {tuuid: string | null, name: string, path?: string} | null,
    onClick?: (tuuid: string | null) => void,
}

export function Breadcrumb(props: BreadcrumbProps) {

    let { root, onClick } = props;

    let username = useUserBrowsingStore(state=>state.usernameBreadcrumb);
    let breadcrumb = useUserBrowsingStore(state=>state.breadcrumb);

    let onClickHandler = useCallback((e: MouseEvent<HTMLLIElement | HTMLParagraphElement>)=>{
        if(!onClick) return;
        let value = e.currentTarget.dataset.tuuid || null;
        onClick(value);
    }, [onClick])

    let breadcrumbMapped = useMemo(()=>{
        if(!username || !breadcrumb || !root) return <></>;
        let breadcrumbMapped = [];
        let ignore = true;
        for(let file of breadcrumb) {
            if(ignore) {
                if(file.tuuid === root.tuuid) {
                    ignore = false;
                } else {
                    continue
                }
            }
            breadcrumbMapped.push(file);
        }

        let lastIdx = breadcrumbMapped.length - 1;
        return breadcrumbMapped.map((item, idx)=>{
            if(idx === lastIdx) {
                return (
                    <li key={item.tuuid} className='flex items-center pl-2 text-sm bg-slate-700 bg-opacity-50 font-bold pr-2'>
                        {item.nom}
                    </li>
                )
            } else {
                return (
                    <li key={item.tuuid} className='flex cursor-pointer items-center pl-2 text-sm bg-slate-700 hover:bg-slate-600 active:bg-slate-500 bg-opacity-50 transition-colors duration-300'>
                        {onClick?
                            <p onClick={onClickHandler} data-tuuid={item.tuuid}>{item.nom}</p>
                        :
                            <Link to={'/apps/collections2/b/' + item.tuuid}>{item.nom}</Link>
                        }
                        
                        <span className="pointer-events-none ml-2 text-slate-800">/</span>
                    </li>
                )
            }
        })
    }, [username, breadcrumb, root, onClick, onClickHandler]);

    if(!root && !username) return <p>Loading ...</p>;

    return (
        <nav aria-label='breadcrumb' className='w-max'>
            <ol className='flex w-full flex-wrap items-center'>
                {breadcrumb?
                    <li className='flex cursor-pointer items-center pl-2 text-sm bg-slate-700 hover:bg-slate-600 active:bg-slate-500 bg-opacity-50 transition-colors duration-300'>
                        {onClick?
                            <p onClick={onClickHandler}>{root?.name || username}</p>
                        :
                            <Link to={root?.path || '/apps/collections2/b'}>{root?.name || username}</Link>
                        }
                        
                        <span className="pointer-events-none ml-2 text-slate-400 font-bold">&gt;</span>
                    </li>
                :
                    <li className='flex items-center pl-2 text-sm bg-slate-700 bg-opacity-50 pr-2'>
                        {root?.name || username}
                    </li>
                }
                {breadcrumbMapped}
            </ol>
        </nav>
    );
}

export function ButtonBar() {

    return (
        <div className='grid grid-cols-2 md:grid-cols-3'>
            <div className='col-span-2'>
                <Link to='/apps/collection2/test'
                    className='varbtn px-3 inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        i
                </Link>

                <Link to='/apps/collection2/test'
                    className='varbtn mx-0 px-4 inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        a
                </Link>
                <Link to='/apps/collection2/test'
                    className='varbtn mx-0 px-4 inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        b
                </Link>
                <Link to='/apps/collection2/test'
                    className='varbtn mx-0 px-4 inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        c
                </Link>

                <Link to='/apps/collection2/test'
                    className='varbtn px-2 inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        + Fichier
                </Link>

                <Link to='/apps/collection2/test'
                    className='varbtn px-2 inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        + Collection
                </Link>

                <Link to='/apps/collection2/test'
                    className='varbtn px-2 inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                        + ZIP
                </Link>
            </div>
            <div className='text-sm'>
                <DirectoryInformation />
            </div>
        </div>        
    );
}

function DirectoryInformation() {
    
    let statistics = useUserBrowsingStore(state=>state.directoryStatistics);

    let [fileInfo, dirInfo] = useMemo(()=>{
        if(!statistics) return [null, null, 0];
        let fileInfo = null, dirInfo = null, totalTuuids = 0;
        for(let info of statistics) {
            if(info.type_node === 'Fichier') {
                fileInfo = info;
            } else if(['Repertoire', 'Collection'].includes(info.type_node)) {
                dirInfo = info;
            }
        }
        return [fileInfo, dirInfo, totalTuuids];
    }, [statistics]);

    if(!statistics) {
        return (
            <p>Loading ...</p>
        )
    }

    return (
        <div className='grid grid-cols-2'>
            <div>
                {fileInfo?.count?
                    <p>{fileInfo.count} files (<Formatters.FormatteurTaille value={fileInfo?.taille} />)</p>
                :
                    <p>No files</p>
                }
                <p>{dirInfo?.count?dirInfo.count:'No'} directories</p>
            </div>
            <LoadingStatus />
        </div>
    )
}

function LoadingStatus() {

    let statistics = useUserBrowsingStore(state=>state.directoryStatistics);
    let currentDirectory = useUserBrowsingStore(state=>state.currentDirectory);

    let totalTuuids = useMemo(()=>{
        if(!statistics) return 0;
        let totalTuuids = 0;
        for(let info of statistics) {
            if(info.count) totalTuuids += info.count;
        }
        return totalTuuids;
    }, [statistics]);

    let pctLoaded = useMemo(()=>{
        if(!currentDirectory || !totalTuuids) return null;
        let current = Object.keys(currentDirectory).length;
        if(current < totalTuuids) {
            let pctLoaded = Math.floor(current / totalTuuids * 100);
            return pctLoaded;
        }
        return null;
    }, [currentDirectory, totalTuuids]);

    if(pctLoaded && pctLoaded < 100) {
        return <p>Loading {pctLoaded}%</p>;
    }

    return (
        <></>
    );
}