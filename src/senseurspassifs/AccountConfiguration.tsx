import { ChangeEvent, useCallback, useEffect, useState } from "react";

import { Link, useNavigate } from "react-router-dom";

import { SelectTimezone } from "./EditDevice";
import useConnectionStore from "../connectionStore";
import useWorkers from "../workers/workers";

function AccountConfiguration() {

    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let workers = useWorkers();

    let navigate = useNavigate();
    
    let [hasChanged, setHasChanged] = useState(false);
    let [timezone, setTimezone] = useState('');
    let timezoneOnChange = useCallback((e: ChangeEvent<HTMLSelectElement>)=>{
        setTimezone(e.currentTarget.value);
        setHasChanged(true);
    }, [setTimezone, setHasChanged]);

    let saveHandler = useCallback(()=>{
        if(!workers) throw new Error("Workers not initialized");

        let configuration = {
            timezone: timezone?timezone:null,
        };

        workers.connection.updateUserConfiguration(configuration)
            .then(result=>{
                if(result.ok) {
                    navigate('/apps/senseurspassifs');
                } else {
                    console.warn("Error saving user configuration: ", result);
                }
            })
            .catch(err=>console.error("Error updating user configuration: ", err));
    }, [workers, timezone, navigate])

    useEffect(()=>{
        if(!workers) return;
        workers.connection.getUserConfiguration()
            .then(response=>{
                setTimezone(response.timezone || '');
            })
            .catch(err=>console.error("User configuration request error ", err));
    }, [workers, setTimezone])

    return (
        <>
            <h1 className='font-bold text-lg pt-2 pb-4'>Account configuration</h1>

            <section className='grid grid-cols-12'>
                <label className='col-span-3'>Timezone</label>
                <div className='col-span-9'>
                    <SelectTimezone value={timezone} onChange={timezoneOnChange} />
                </div>

                <div className='pt-4 col-span-12 text-center'>
                    <button onClick={saveHandler} disabled={!ready || !hasChanged}
                        className='btn inline-block text-center bg-indigo-800 hover:bg-indigo-600 active:bg-indigo-500 disabled:bg-indigo-900'>
                            Save
                    </button>
                    <Link to='/apps/senseurspassifs'
                        className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500'>
                            Cancel
                    </Link>
                </div>
            </section>
        </>
    )
}

export default AccountConfiguration;
