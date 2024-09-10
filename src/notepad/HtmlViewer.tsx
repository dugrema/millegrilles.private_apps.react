import { useMemo } from 'react';

function HtmlViewer(props: {value: string | null}) {

    let { value } = props;

    let htmlValue = useMemo(()=>{
        if(!value) return {'__html': ''};
        return {"__html": value};
    }, [value]);

    return (
        <>
            <div dangerouslySetInnerHTML={htmlValue} />
        </>
    )
}

export default HtmlViewer;
