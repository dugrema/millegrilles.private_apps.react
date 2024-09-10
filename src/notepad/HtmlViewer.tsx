import { useEffect, useMemo, useState } from 'react';

function HtmlViewer(props: {value: string | null}) {

    let { value } = props;

    let htmlValue = useMemo(()=>{
        if(!value) return '';
        return value;
    }, [value])

    return (
        <>
            <div dangerouslySetInnerHTML={{"__html": htmlValue}} />
        </>
    )
}

export default HtmlViewer;
