import { ChangeEvent, MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
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
        <>
            <section className='pt-12'>
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
                <h2 className='text-xl font-bold pt-6'>Test area</h2>
                <TestArea />
            </section>
        </>
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
        return filehosts.filter(item=>item.url_external).map(item=>{
            return <option key={item.filehost_id} value={item.filehost_id}>{item.url_external}</option>;
        });
    }, [filehosts]);

    let changeFilehostHandler = useCallback(async ()=>{
        // Save the filehost to local storage and trigger a reconnection
        localStorage.setItem(`filehost_${userId}`, current);
        setFilehostId(current);
    }, [current, setFilehostId]);

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
        loadEstimate(setStorageUsage).catch(err=>console.error("Error loading storage usage", err));
        let interval = setInterval(()=>{
            loadEstimate(setStorageUsage).catch(err=>console.error("Error loading storage usage", err));
        }, 3_000);
        return () => {
            clearInterval(interval);
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

/** Used to test features. */
function TestArea() {

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    let downloadWorkerCallback = useCallback(async () => {
        if(!workers || !ready) throw new Error('workers not initialized');
        
        console.debug("test download");
        //let response = await workers?.download.getActiveDownloads();
        //console.debug("Download worker response", response);

        await testBounds('zSEfXUA2auCgqVJ1Lrxv9yF9vgq9se7CDGhMdFNynV43EAitCuZuAXMsyCNz75uiKG3ibgrvkdLP4WHtjAxrmZMtM6k4Ji')
    }, [workers, ready])

    return (
        <>
            <p>Download worker presence</p>
            <ActionButton onClick={downloadWorkerCallback}>Download test</ActionButton>
        </>
    )
}
