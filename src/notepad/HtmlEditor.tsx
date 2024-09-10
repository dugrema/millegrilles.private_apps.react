import { useEffect, useState } from 'react';
import { useQuill } from 'react-quilljs';


function HtmlEditor(props: {value: string | null, onChange: (value: string)=>void}) {

    let { value, onChange } = props;

    let { quill, quillRef } = useQuill();

    let [editorContent, setEditorContent] = useState(null as string |null);

    // Apply onChange
    useEffect(()=>{
        if(editorContent === null) return;  // Break loop when onChange updates.
        setEditorContent(null);             // Allows onChange to be updated
        if(onChange) onChange(editorContent);
    }, [editorContent, onChange, setEditorContent])

    // Register the event listener on quill. Must be set-up only once.
    useEffect(()=>{
        if(!quill) return;

        const textOnChange = ()=>{
            if(quill) setEditorContent(quill.root.innerHTML);
        };

        quill.on('text-change', textOnChange);
        return () => {
            if(quill) quill.off('text-change', textOnChange);
        }
    }, [quill, setEditorContent]);

    // Insert initial value in quill editor.
    useEffect(()=>{
        if(!quill) return;
        if(value) {
            quill.clipboard.dangerouslyPasteHTML(value);
        }
    }, [quill, value]);

    return (
        <div ref={quillRef} />
    )
}

export default HtmlEditor;
