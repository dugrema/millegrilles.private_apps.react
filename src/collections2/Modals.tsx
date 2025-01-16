import { ChangeEvent, MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import useWorkers, { AppWorkers } from "../workers/workers";
import useUserBrowsingStore, { TuuidsBrowsingStoreRow } from "./userBrowsingStore";
import FilelistPane, { FileListPaneOnClickRowType } from "./FilelistPane";
import { ModalBreadcrumb, ModalDirectorySyncHandler } from "./ModalBrowsing";
import ActionButton from "../resources/ActionButton";
import useConnectionStore from "../connectionStore";
import { Formatters } from "millegrilles.reactdeps.typescript";
import { Collection2ContactItem, Collection2DirectoryStats } from "../workers/connection.worker";
import { sortContacts } from "./SharedContacts";
import { Link } from "react-router-dom";

import ShareIcon from '../resources/icons/share-1-svgrepo-com.svg';

type ModalInformationProps = {
    workers: AppWorkers | null,
    ready: boolean,
    close: ()=>void,
}

export function ModalInformation(props: ModalInformationProps) {

    let {close} = props;

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let cuuid = useUserBrowsingStore(state=>state.currentCuuid);
    let currentDirectory = useUserBrowsingStore(state=>state.currentDirectory);

    let [statsSubdirectories, setStatsSubdirectories] = useState(null as Collection2DirectoryStats[] | null);

    useEffect(()=>{
        if(!workers || !ready) return;  // Nothing to do
        workers.connection.getCollection2Statistics(cuuid)
            .then(response=>{
                setStatsSubdirectories(response.info);
            })
            .catch(err=>console.error("Error loading statistics", err));
    }, [workers, ready, cuuid, setStatsSubdirectories]);

    let statsValues = useMemo(()=>{
        let subFiles = 0, subDirectories = 0, totalSize = 0;
        if(statsSubdirectories) {
            for(let stat of statsSubdirectories) {
                if(stat.type_node === 'Fichier') {
                    subFiles = stat.count;
                    totalSize = stat.taille;
                } else {
                    subDirectories += stat.count;
                }
            }
        }

        return {subFiles, subDirectories, totalSize};
    }, [statsSubdirectories]);

    let statusDirectory = useMemo(()=>{
        let files = 0, directories = 0, size = 0; 
        if(currentDirectory) {
            for(let file of Object.values(currentDirectory)) {
                if(file.type_node === 'Fichier') {
                    files += 1;
                    if(file.taille) size += file.taille;
                } else {
                    directories += 1;
                }
            }
        }
        return {files, directories, size};
    }, [currentDirectory]);

    return (
        <div tabIndex={-1} aria-hidden="true" 
            className="overflow-y-auto overflow-x-hidden fixed top-0 right-0 left-0 z-50 justify-center items-center w-full md:inset-0 h-[calc(100%-1rem)] max-h-full">
            <div className="relative p-4 w-full max-w-2xl max-h-full">
                <div className="relative rounded-lg shadow bg-gray-800">
                    <div className="flex items-center justify-between p-4 md:p-5 border-b rounded-t border-gray-600">
                        <h3 className="text-xl font-semibold text-white">
                            Information
                        </h3>
                        <button onClick={close} className="bg-transparent rounded-lg text-sm w-8 h-8 ms-auto inline-flex justify-center items-center hover:bg-gray-600 hover:text-white">
                            <svg className="w-3 h-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14">
                                <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"/>
                            </svg>
                            <span className="sr-only">Close modal</span>
                        </button>
                    </div>
                    <div className="p-4 md:p-5 space-y-4">
                        <p className="text-base leading-relaxed text-gray-400">
                            Current directory
                        </p>
                        <div className='grid grid-cols-3'>
                            <div className="text-base leading-relaxed text-gray-400">Size</div>
                            <div className='col-span-2'>
                                <Formatters.FormatteurTaille value={statusDirectory.size} />
                            </div>
                            <div className="text-base leading-relaxed text-gray-400">Files</div>
                            <div className='col-span-2'>{statusDirectory.files}</div>
                            <div className="text-base leading-relaxed text-gray-400">Directories</div>
                            <div className='col-span-2'>{statusDirectory.directories}</div>
                        </div>
                        <p className="text-base leading-relaxed text-gray-400">
                            Including sub-directories
                        </p>
                        <div className='grid grid-cols-3'>
                            <div className="text-base leading-relaxed text-gray-400">Size</div>
                            <div className='col-span-2'>
                                <Formatters.FormatteurTaille value={statsValues.totalSize} />
                            </div>
                            <div className="text-base leading-relaxed text-gray-400">Files</div>
                            <div className='col-span-2'>{statsValues.subFiles}</div>
                            <div className="text-base leading-relaxed text-gray-400">Directories</div>
                            <div className='col-span-2'>{statsValues.subDirectories}</div>
                        </div>
                    </div>
                    <div className="flex items-center p-4 md:p-5 border-t rounded-b border-gray-600">
                        <button onClick={close}
                                className="varbtn w-32 border-gray-200 hover:bg-gray-100 focus:z-10 focus:ring-4 focus:ring-gray-600 bg-gray-700 text-gray-400 border-gray-500 hover:text-white hover:bg-gray-600">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function ModalNewDirectory(props: ModalInformationProps) {

    let {close} = props;

    return (
        <div tabIndex={-1} aria-hidden="true" 
            className="overflow-y-auto overflow-x-hidden fixed top-0 right-0 left-0 z-50 justify-center items-center w-full md:inset-0 h-[calc(100%-1rem)] max-h-full">
            <div className="relative p-4 w-full max-w-2xl max-h-full">
                <div className="relative rounded-lg shadow bg-gray-700">
                    <div className="flex items-center justify-between p-4 md:p-5 border-b rounded-t border-gray-600">
                        <h3 className="text-xl font-semibold text-white">
                            Information
                        </h3>
                        <button onClick={close} className="bg-transparent rounded-lg text-sm w-8 h-8 ms-auto inline-flex justify-center items-center hover:bg-gray-600 hover:text-white" data-modal-hide="default-modal">
                            <svg className="w-3 h-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14">
                                <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"/>
                            </svg>
                            <span className="sr-only">Close modal</span>
                        </button>
                    </div>
                    <div className="p-4 md:p-5 space-y-4">
                        <p className="text-base leading-relaxed text-gray-400">
                            With less than a month to go before the European Union enacts new consumer privacy laws for its citizens, companies around the world are updating their terms of service agreements to comply.
                        </p>
                        <p className="text-base leading-relaxed text-gray-400">
                            The European Union’s General Data Protection Regulation (G.D.P.R.) goes into effect on May 25 and is meant to ensure a common set of data rights in the European Union. It requires organizations to notify users as soon as possible of high-risk data breaches that could personally affect them.
                        </p>
                    </div>
                    <div className="flex items-center p-4 md:p-5 border-t rounded-b border-gray-600">
                        <button onClick={close}
                            className="text-white focus:ring-4 focus:outline-none font-medium rounded-lg text-sm px-5 py-2.5 text-center bg-violet-600 hover:bg-violet-700 focus:ring-violet-800">I accept</button>
                        <button onClick={close}
                            className="py-2.5 px-5 ms-3 text-sm font-medium focus:outline-none rounded-lg border border-gray-200 hover:bg-gray-100 focus:z-10 focus:ring-4 focus:ring-gray-700 bg-gray-800 text-gray-400 border-gray-600 hover:text-white hover:bg-gray-700">Decline</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function ModalBrowseAction(props: ModalInformationProps & {title: string}) {

    let {close, title} = props;

    let filesDict = useUserBrowsingStore(state=>state.modalNavCurrentDirectory);
    let cuuid = useUserBrowsingStore(state=>state.modalNavCuuid);
    let setModalCuuid = useUserBrowsingStore(state=>state.setModalCuuid);

    let files = useMemo(()=>{
        if(!filesDict) return null;
        let filesValues = Object.values(filesDict).filter(item=>item.type_node !== 'Fichier');
        return filesValues;
    }, [filesDict]) as TuuidsBrowsingStoreRow[] | null;

    let onClickRow = useCallback((e, tuuid, typeNode, range)=>{
        if(typeNode === 'Repertoire' || typeNode === 'Collection') {
            setModalCuuid(tuuid);
        }
    }, [setModalCuuid]) as FileListPaneOnClickRowType;

    let actionHandler = useCallback(async () => {
        //throw new Error('todo');
        if(!cuuid) throw new Error("Must select a directory (root not valid)");
        setTimeout(()=>close(), 1_000);
    }, [close, cuuid]);

    return (
        <>
            <div tabIndex={-1} aria-hidden="true" 
                className="overflow-y-auto overflow-x-hidden fixed top-0 right-0 left-0 z-50 justify-center items-center w-full md:inset-0 h-[calc(100%-2rem)] max-h-full">
                <div className="relative p-4 w-full max-w-2xl max-h-full">
                    <div className="relative rounded-lg shadow bg-gray-800">
                        <div className="flex items-center justify-between p-4 md:p-5 border-b rounded-t border-gray-600">
                            <h3 className="text-xl font-semibold text-white">{title}</h3>
                            <button onClick={close} className="bg-transparent rounded-lg text-sm w-8 h-8 ms-auto inline-flex justify-center items-center hover:bg-gray-600 hover:text-white" data-modal-hide="default-modal">
                                <svg className="w-3 h-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14">
                                    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"/>
                                </svg>
                                <span className="sr-only">Close</span>
                            </button>
                        </div>

                        <div className="p-4 md:p-5 space-y-4">
                            <div className='grid grid-cols-12'>
                                <p>To:</p>
                                <ModalBreadcrumb />
                            </div>
                            <div className='h-20 lg:min-h-96 lg:h-auto overflow-y-scroll'>
                                <FilelistPane files={files} onClickRow={onClickRow} columnNameOnly={true} />
                            </div>
                        </div>

                        <div className="flex items-center p-4 md:p-5 border-t rounded-b border-gray-600">
                            <ActionButton onClick={actionHandler} mainButton={true} varwidth={32}>
                                Ok
                            </ActionButton>
                            <button onClick={close}
                                className="varbtn w-32 border-gray-200 hover:bg-gray-100 focus:z-10 focus:ring-4 focus:ring-gray-600 bg-gray-700 text-gray-400 border-gray-500 hover:text-white hover:bg-gray-600">
                                    Cancel
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <ModalDirectorySyncHandler />
        </>
    );
}

function ContactRow(props: {contact: Collection2ContactItem, checked: boolean, onClick: (e: MouseEvent<HTMLDivElement>)=>void}) {

    let {contact, onClick, checked} = props;

    let onClickCheckBox = useCallback((e: ChangeEvent<HTMLInputElement>)=>{
        // Placeholder to avoid warning - handled by the div
        e.stopPropagation();
    }, [contact]);

    return (
        <div onClick={onClick} data-contactid={contact.contact_id}
            className="px-2 py-1 odd:bg-slate-500 even:bg-slate-400 hover:bg-violet-800 odd:bg-opacity-40 even:bg-opacity-40 text-sm select-none">
            <input type="checkbox" checked={checked} className='pl-1' onChange={onClickCheckBox} value={contact.user_id} />
            <span className='pl-2 w-32'>{contact.nom_usager}</span>
        </div>
    )
}

export function ModalShareCollection(props: ModalInformationProps) {

    let {close} = props;

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let selection = useUserBrowsingStore(state=>state.selection);
    let currentDirectory = useUserBrowsingStore(state=>state.currentDirectory);

    let [contacts, setContacts] = useState(null as Collection2ContactItem[] | null);
    let [sharedWithContactIds, setSharedWithContactIds] = useState([] as string[]);
    let [initialSharedWithContactIds, setInitialSharedWithContactIds] = useState(null as string[] | null);

    let onClickRow = useCallback((e: MouseEvent<HTMLDivElement>)=>{
        let contactId = e.currentTarget.dataset.contactid as string;
        let sharedCopy = [] as string[];
        if(sharedWithContactIds && sharedWithContactIds.includes(contactId)) {
            // remove
            sharedCopy = sharedWithContactIds.filter(item=>item!==contactId);
        } else {
            // add
            if(sharedWithContactIds) sharedCopy = [...sharedWithContactIds];
            sharedCopy.push(contactId);
        }
        setSharedWithContactIds(sharedCopy);
    }, [sharedWithContactIds, setSharedWithContactIds]);

    let contactElems = useMemo(()=>{
        if(!contacts) return [];
        let contactsCopy = [...contacts];
        contactsCopy.sort(sortContacts);
        return contactsCopy.map(item=>{
            let checked = sharedWithContactIds.includes(item.contact_id) || false;
            return <ContactRow key={item.contact_id} contact={item} checked={checked} onClick={onClickRow} />;
        });
    }, [contacts, sharedWithContactIds, onClickRow]);
    
    let actionHandler = useCallback(async () => {
        if(!workers || !ready || !sharedWithContactIds) throw new Error("Workers not initialized or value empty");
        if(!selection || selection.length === 0) throw new Error('At least 1 collection must be selected');
        
        if(sharedWithContactIds.length > 0) {
            let response = await workers.connection.shareCollection2Collection(selection, sharedWithContactIds)
            if(!response.ok) throw new Error("Error changing shared collections: " + response.err);
        }

        if(initialSharedWithContactIds) {
            // Remove shares if required
            let initialSet = new Set(initialSharedWithContactIds);
            for(let item of sharedWithContactIds) {
                initialSet.delete(item);
            }
            let toDelete = [] as string[];
            initialSet.forEach(item=>toDelete.push(item));
            for(let cuuid of selection) {
                for(let contactId of toDelete) {
                    let response = await workers.connection.removeShareCollection2Collection(cuuid, contactId);
                    if(!response.ok) throw new Error("Error removing contact: " + response.err);
                }
            }
        }

        // Success, close
        setTimeout(()=>close(), 1_000);
    }, [workers, ready, sharedWithContactIds, initialSharedWithContactIds, close])

    useEffect(()=>{
        if(!workers || !ready || !currentDirectory) return;
        if(!selection || selection.length < 1) throw new Error('Selection invalid - selection must have at least 1 element');

        // Check that all items in the selection are directories
        //@ts-ignore
        let selectedItems = selection.map(item=>currentDirectory[item]).filter(item=>item?.type_node!=='Fichier');
        if(selectedItems.length !== selection.length) throw new Error('At least one selected item is not a collection/directory');

        Promise.resolve().then(async ()=>{
            if(!workers) throw new Error('workers not initialized');
            let contactsResponse = await workers.connection.getCollection2ContactList();
            let contacts = contactsResponse.contacts;
            setContacts(contacts);

            let contactsByContactId = {} as {[c:string]: Collection2ContactItem};
            if(contacts) {
                for(let item of contacts) {
                    contactsByContactId[item.contact_id] = item;
                }
            }

            let sharedCollectionsResponse = await workers.connection.getCollection2SharedCollections();
            if(sharedCollectionsResponse.partages) {
                let sharedContactIds = [] as Array<string|null>;
                
                if(selection && selection.length === 1) {
                    // Only show currently shared contacts if a single selection is present
                    let cuuid = selection[0];
                    sharedContactIds = sharedCollectionsResponse.partages.filter(item=>item.tuuid === cuuid).map(item=>{
                        let contact = contactsByContactId[item.contact_id];
                        if(contact) {return contact.contact_id}
                        else return null;
                    });
                } else {
                    setInitialSharedWithContactIds(null);
                }
                // Filter out nulls, keep contactIds
                let sharedCollections = sharedContactIds.filter(item=>item) as string[];
                setInitialSharedWithContactIds(sharedCollections);
                setSharedWithContactIds(sharedCollections);
            }
        })
        .catch(err=>console.error("Error loading contacts / shared collections", err));
    }, [workers, ready, selection, currentDirectory, setContacts, setInitialSharedWithContactIds, setSharedWithContactIds]);

    return (
        <div tabIndex={-1} aria-hidden="true" 
            className="overflow-y-auto overflow-x-hidden fixed top-0 right-0 left-0 z-50 justify-center items-center w-full md:inset-0 h-[calc(100%-1rem)] max-h-full">
            <div className="relative p-4 w-full max-w-2xl max-h-full">
                <div className="relative rounded-lg shadow bg-gray-800">
                    <div className="flex items-center justify-between p-4 md:p-5 border-b rounded-t border-gray-600">
                        <h3 className="text-xl font-semibold text-white">
                            Share collection
                        </h3>
                        <button onClick={close} className="bg-transparent rounded-lg text-sm w-8 h-8 ms-auto inline-flex justify-center items-center hover:bg-gray-600 hover:text-white" data-modal-hide="default-modal">
                            <svg className="w-3 h-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14">
                                <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"/>
                            </svg>
                            <span className="sr-only">Close</span>
                        </button>
                    </div>
                    <div className="p-4 md:p-5">
                        <p className="pb-4 text-base leading-relaxed text-gray-400">
                            Select the users to share this collection with.
                        </p>
                        {contactElems.length > 0?
                            contactElems
                            :
                            <p className="text-base leading-relaxed text-gray-400">
                                You do not have any contacts. You can add contacts using the 
                                <Link to='/apps/collections2/c' className='px-1 font-bold underline'>
                                    Share <img src={ShareIcon} className='w-6 inline ml-1'/>
                                </Link> link in the menu.
                            </p>
                        }
                    </div>
                    <div className="flex items-center p-4 md:p-5 border-t rounded-b border-gray-600">
                        <ActionButton onClick={actionHandler} mainButton={true} varwidth={32} >
                            Ok
                        </ActionButton>
                        <button onClick={close}
                            className="varbtn w-32 border-gray-200 hover:bg-gray-100 focus:z-10 focus:ring-4 focus:ring-gray-600 bg-gray-700 text-gray-400 border-gray-500 hover:text-white hover:bg-gray-600">
                                Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function ModalImportZip(props: ModalInformationProps) {

    let {close} = props;

    return (
        <div tabIndex={-1} aria-hidden="true" className="overflow-y-auto overflow-x-hidden fixed top-0 right-0 left-0 z-50 justify-center items-center w-full md:inset-0 h-[calc(100%-1rem)] max-h-full">
            <div className="relative p-4 w-full max-w-2xl max-h-full">
                <div className="relative bg-white rounded-lg shadow dark:bg-gray-700">
                    <div className="flex items-center justify-between p-4 md:p-5 border-b rounded-t dark:border-gray-600">
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                            Import ZIP file in directory
                        </h3>
                        <button onClick={close} className="text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm w-8 h-8 ms-auto inline-flex justify-center items-center dark:hover:bg-gray-600 dark:hover:text-white" data-modal-hide="default-modal">
                            <svg className="w-3 h-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14">
                                <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"/>
                            </svg>
                            <span className="sr-only">Close modal</span>
                        </button>
                    </div>
                    <div className="p-4 md:p-5 space-y-4">
                        <p className="text-base leading-relaxed text-gray-500 dark:text-gray-400">
                            With less than a month to go before the European Union enacts new consumer privacy laws for its citizens, companies around the world are updating their terms of service agreements to comply.
                        </p>
                        <p className="text-base leading-relaxed text-gray-500 dark:text-gray-400">
                            The European Union’s General Data Protection Regulation (G.D.P.R.) goes into effect on May 25 and is meant to ensure a common set of data rights in the European Union. It requires organizations to notify users as soon as possible of high-risk data breaches that could personally affect them.
                        </p>
                    </div>
                    <div className="flex items-center p-4 md:p-5 border-t border-gray-200 rounded-b dark:border-gray-600">
                        <button onClick={close}
                            className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800">I accept</button>
                        <button onClick={close}
                            className="py-2.5 px-5 ms-3 text-sm font-medium text-gray-900 focus:outline-none bg-white rounded-lg border border-gray-200 hover:bg-gray-100 hover:text-blue-700 focus:z-10 focus:ring-4 focus:ring-gray-100 dark:focus:ring-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:text-white dark:hover:bg-gray-700">Decline</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
