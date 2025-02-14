import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { VIDEO_RESOLUTIONS } from "./picklistValues";
import ActionButton from "../resources/ActionButton";
import { cleanup, testBounds } from "./idb/collections2StoreIdb";
import { Formatters } from "millegrilles.reactdeps.typescript";
import useWorkers from "../workers/workers";
import useConnectionStore from "../connectionStore";
import { Filehost } from "../workers/connection.worker";
import useUserBrowsingStore from "./userBrowsingStore";

function SettingsPage() {
    return (
        <div className='fixed top-10 md:top-12 left-0 right-0 px-2 bottom-10 overflow-y-auto w-full'>
            <section>
                <h1 className='text-xl font-bold'>Settings</h1>
            </section>

            <section>
                <ResolutionSettings />
            </section>

            <section>
                <h2 className='text-xl font-bold pt-6'>File host</h2>
                <FilehostConfiguration />
            </section>

            <section>
                <h2 className='text-xl font-bold pt-6'>Maintenance actions</h2>
                <Cleanup />
            </section>

            <section>
                <h2 className='text-xl font-bold pt-6'>Disk usage</h2>
                <StoragePersistence />
            </section>
            

            <section>
                <h2 className='text-xl font-bold pt-6'>Test area</h2>
                <TestArea />
            </section>
        </div>
    )
}

export default SettingsPage;

export const CONST_VIDEO_MAX_RESOLUTION = 'videoMaxResolution';

function ResolutionSettings() {

    let [selected, setSelected] = useState('');

    let optionsElem = useMemo(()=>{
        return VIDEO_RESOLUTIONS.map(item=>{
            return <option key={item.value} value={item.value} className='font-black'>{item.label}</option>;
        });
    }, []);

    let actionHandler = useCallback(async()=>{
        localStorage.setItem(CONST_VIDEO_MAX_RESOLUTION, selected);
    }, [selected]);

    let onChange = useCallback((e: ChangeEvent<HTMLSelectElement>)=>setSelected(e.currentTarget.value), [setSelected]);

    useEffect(()=>{
        let initalValue = localStorage.getItem(CONST_VIDEO_MAX_RESOLUTION);
        if(initalValue) setSelected(initalValue);
    }, []);

    return (
        <div className='grid col-span-1 w-64 pt-4'>
            <label htmlFor='select-resolution'>Default maximum video resolution</label>
            <select id='select-resolution' value={selected} onChange={onChange}
                className='text-black bg-slate-300'>
                    {optionsElem}
            </select>
            <div><ActionButton onClick={actionHandler} revertSuccessTimeout={3}>Change</ActionButton></div>
        </div>
    )
}

function FilehostConfiguration() {

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let userId = useUserBrowsingStore(state=>state.userId);
    let setFilehostId = useConnectionStore(state=>state.setFilehostId);

    let [current, setCurrent] = useState('');
    let currentOnChange = useCallback((e: ChangeEvent<HTMLSelectElement>)=>setCurrent(e.currentTarget.value), [setCurrent]);
    let [filehosts, setFilehosts] = useState(null as Filehost[] | null);

    let filehostOptions = useMemo(()=>{
        if(!filehosts) return [];
        return filehosts.filter(item=>item.url_external && item.tls_external !== 'millegrille').map(item=>{
            return <option key={item.filehost_id} value={item.filehost_id}>{item.url_external}</option>;
        });
    }, [filehosts]);

    let changeFilehostHandler = useCallback(async ()=>{
        // Save the filehost to local storage and trigger a reconnection
        localStorage.setItem(`filehost_${userId}`, current);
        setFilehostId(current);
    }, [current, userId, setFilehostId]);

    useEffect(()=>{
        if(!userId) return;
        let current = localStorage.getItem(`filehost_${userId}`) || '';
        console.debug("Setting current filehostId to ", current);
        setCurrent(current);
    }, [userId, setCurrent]);

    useEffect(()=>{
        if(!workers || !ready) return;
        workers.connection.getFilehosts()
            .then(response=>{
                console.debug('Filehosts: ', response);
                if(response.ok && response.list) {
                    setFilehosts(response.list)
                } else {
                    console.error("Error loading filehosts: ", response.err);
                }
            })
    }, [workers, ready]);

    return (
        <>
            <p>You can select the filehost to use for uploading and downloading files.</p>

            <div className='grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 pt-2'>
                <label htmlFor='select-filehost'>File host</label>
                <select id='select-filehost' value={current} onChange={currentOnChange} className='col-span-2 text-black bg-slate-300'>
                    <option value='LOCAL'>Default</option>
                    {filehostOptions}
                </select>
            </div>

            <ActionButton onClick={changeFilehostHandler} disabled={!ready}>Save</ActionButton>
        </>
    )
}

function Cleanup() {

    let [storageUsage, setStorageUsage] = useState(null as number | null);

    let cleanupHandler = useCallback(async ()=>{
        await cleanup();
    }, []);

    useEffect(()=>{
        // @ts-ignore
        if(navigator.storage.estimate) {
            loadEstimate(setStorageUsage).catch(err=>console.error("Error loading storage usage", err));
            let interval = setInterval(()=>{
                loadEstimate(setStorageUsage).catch(err=>console.error("Error loading storage usage", err));
            }, 3_000);
            return () => {
                clearInterval(interval);
            }
        }
    }, []);

    return (
        <div className='pt-4'>
            <p>Cleanup history - removes all downloaded files and decrypted content from Collections2. Maintains configuration.</p>
            {typeof(storageUsage) === 'number'?
                <>
                    <p className='pt-2'>Current estimated usage for MilleGrilles:</p>
                    <p className='font-bold'><Formatters.FormatteurTaille value={storageUsage} /></p>
                </>
            :<></>}
            <ActionButton onClick={cleanupHandler}>Cleanup</ActionButton>
        </div>
    );
}

async function loadEstimate(setStorageUsage: (usage: number | null)=>void) {
    let estimate = await navigator.storage.estimate();
    setStorageUsage(estimate.usage || null);
}

function StoragePersistence() {

    let [persistenceState, setPersistenceState] = useState(false);
    let [estimate, setEstimate] = useState(null as StorageEstimate | null);

    useEffect(()=>{
        navigator.storage.persisted()
            .then(isPersisted=>{
                setPersistenceState(isPersisted);
            })
            .catch(err=>console.error("Error loading browser persistence state"));
    }, [setPersistenceState]);

    let persistenceCallback = useCallback(async () => {
        let result = await navigator.storage.persist();
        if(!result) throw Error("Persistence not granted");
        setPersistenceState(true);
    }, [setPersistenceState]);

    useEffect(()=>{
        // @ts-ignore
        if(navigator.storage.estimate) {
            navigator.storage.estimate()
                .then(setEstimate)
                .catch(err=>console.error("Error loading estimate", err));

            let interval = setInterval(()=>{
                navigator.storage.estimate()
                .then(setEstimate)
                .catch(err=>console.error("Error loading estimate", err));
            }, 1_500)

            return () => {
                clearInterval(interval);
            }
        }

    }, [setEstimate]);

    let storageElem = useMemo(()=>{
        let usage = <>N/A</>;
        if(estimate?.usage) {
            usage = <Formatters.FormatteurTaille value={estimate.usage} />;
        }
        let quota = <>N/A</>;
        if(estimate?.quota) {
            quota = <Formatters.FormatteurTaille value={estimate.quota} />;
        }
        return <div><p>Usage: {usage}</p><p>Quota: {quota}</p></div>;
    }, [estimate])

    return (
        <>
            <p>Activate storage persistence</p>
            <p>Current state: {persistenceState?'Active':'Inactive'}</p>
            <p>This is useful to process larger files - it increases the amount of disk space the browser can use.</p>
            <p>Storage estimate:</p>
            {storageElem}
            <ActionButton onClick={persistenceCallback} disabled={persistenceState}>Allow disk usage</ActionButton>
        </>
    )
}

/** Used to test features. */
function TestArea() {

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    let [downloadFiles, setDownloadFiles] = useState(null as number | null);

    let downloadWorkerCallback = useCallback(async () => {
        if(!workers || !ready) throw new Error('workers not initialized');
        
        console.debug("test download");
        //let response = await workers?.download.getActiveDownloads();
        //console.debug("Download worker response", response);

        await testBounds('zSEfXUA2auCgqVJ1Lrxv9yF9vgq9se7CDGhMdFNynV43EAitCuZuAXMsyCNz75uiKG3ibgrvkdLP4WHtjAxrmZMtM6k4Ji')
    }, [workers, ready])

    let fsCreateList = useCallback(async () =>{
        let error = await workers?.directory.testFileSystem1();
        if(error) {
            console.error("Error: ", error);
            throw new Error(error);
        }
    }, [workers]);

    let fsListDownloads = useCallback(async () =>{
        if(!navigator.storage.getDirectory) throw new Error('getDirectory not supported');

        console.debug("Getting root directory")
        let root = await navigator.storage.getDirectory();
        console.debug("Root directory", root);

        try {
            let downloads = await root.getDirectoryHandle('downloads');
            console.debug("Downloads", downloads);
            let count = 0;
            // @ts-ignore
            for await(let entry of downloads.values()) {
                console.debug("File entry: ", entry);
                count++;
            }
            setDownloadFiles(count);
        } catch(err) {
            console.error("Error getting downloads", err);
            throw new Error(`Error getting downloads: ${err}`);
        }
    }, [setDownloadFiles]);

    return (
        <>
            <p>Download worker presence</p>
            <ActionButton onClick={downloadWorkerCallback}>Download test</ActionButton>
            <p>File system</p>
            <p>Downloads: {downloadFiles}</p>
            <ActionButton onClick={fsCreateList}>Create / list</ActionButton>
            <ActionButton onClick={fsListDownloads}>List downloads</ActionButton>
        </>
    )
}
