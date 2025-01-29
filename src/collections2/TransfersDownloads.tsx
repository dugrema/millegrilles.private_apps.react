import { useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import ActionButton from "../resources/ActionButton";

function TransfersDownloads() {

    let completedTransfersPresent = true;

    let removeCompletedHandler = useCallback(async ()=>{

    }, []);

    return (
        <>
            <section>
                <h2 className='font-bold pt-4 pb-2'>Downloads</h2>

                <div>
                    <ActionButton onClick={removeCompletedHandler} mainButton={true} disabled={!completedTransfersPresent}>
                        Remove completed
                    </ActionButton>
                    <Link to={'/apps/collections2/transfers'}
                        className='btn inline-block text-center bg-slate-700 hover:bg-slate-600 active:bg-slate-500 disabled:bg-slate-800'>
                            Back
                    </Link>
                </div>
            </section>

            <CompletedTransfers />
            <OngoingTransfers />
        </>
    );
}

export default TransfersDownloads;

function OngoingTransfers() {
    let mappedTransfers = useMemo(()=>{
        return [<div key='1'>T1</div>];
    }, []);

    if(mappedTransfers.length === 0) return <></>;

    return (
        <section>
            <h2 className='font-bold pt-4 pb-2'>Ongoing transfers</h2>
            {mappedTransfers}
        </section>
    );
}

function CompletedTransfers() {
    let mappedTransfers = useMemo(()=>{
        return [<div key='1'>T1</div>];
    }, []);

    if(mappedTransfers.length === 0) return <></>;

    return (
        <section>
            <h2 className='font-bold pt-4 pb-2'>Completed transfers</h2>
            {mappedTransfers}
        </section>
    );
}
