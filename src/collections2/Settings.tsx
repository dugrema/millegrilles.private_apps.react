import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { VIDEO_RESOLUTIONS } from "./picklistValues";
import ActionButton from "../resources/ActionButton";
import { cleanup, testBounds } from "./idb/collections2StoreIdb";
import { Formatters } from "millegrilles.reactdeps.typescript";
import useWorkers from "../workers/workers";
import useConnectionStore from "../connectionStore";

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
            <ActionButton onClick={actionHandler} revertSuccessTimeout={3}>Change</ActionButton>
        </div>
    )
}

function Cleanup() {

    let [storageUsage, setStorageUsage] = useState(null as number | null);

    let cleanupHandler = useCallback(async ()=>{
        await cleanup();
    }, [setStorageUsage]);

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
            <p>Cleanup history - removes all downloaded files and decrypted content from Collections2. Keeps configuration.</p>
            {typeof(storageUsage) === 'number'?
                <p>Current estimated usage for MilleGrilles: <Formatters.FormatteurTaille value={storageUsage} /></p>
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
        let response = await workers?.download.getActiveDownloads();
        console.debug("Download worker response", response);

        await testBounds('zSEfXUA2auCgqVJ1Lrxv9yF9vgq9se7CDGhMdFNynV43EAitCuZuAXMsyCNz75uiKG3ibgrvkdLP4WHtjAxrmZMtM6k4Ji')
    }, [workers, ready])

    return (
        <>
            <p>Download worker presence</p>
            <ActionButton onClick={downloadWorkerCallback}>Download test</ActionButton>
        </>
    )
}
