import React, { ChangeEvent, MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ActionButton from "../resources/ActionButton";
import useWorkers from "../workers/workers";
import useConnectionStore from "../connectionStore";
import { LanguageModelType } from "./chatStore";

function AiConfigure() {
    return(
        <>
            <h1 className='font-bold pt-2 pb-3'>AI Chat Configuration</h1>

            <Link to='/apps/aichat'
                className='btn inline-block bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-center'>
                    Back
            </Link>

            <UrlConfiguration />

            <Models />
            <InstanceInformation />
        </>
    )
}

export default AiConfigure;


function UrlConfiguration() {

    const workers = useWorkers();
    const ready = useConnectionStore(state=>state.connectionAuthenticated);

    const [url, setUrl] = useState('');
    const [urls, setUrls] = useState([] as string[]);

    const urlOnChangeHandler = useCallback((e: ChangeEvent<HTMLInputElement>)=>setUrl(e.currentTarget.value), [setUrl]);

    const addUrlHandler = useCallback(async () => {
        if(!workers || !ready) throw new Error('workers not initialized');
        if(!url) throw new Error('emtpy field');  // Nothing to do
        const verifiedUrl = new URL(url);
        if(urls.includes(verifiedUrl.href)) throw new Error('URL already in the list')

        const updatedUrls = [...urls, verifiedUrl.href];
        const response = await workers.connection.setOllamaUrls(updatedUrls);
        if(response.ok !== true) throw new Error("Error setting urls: " + response.err);

        setUrls(updatedUrls);
        setUrl('');
    }, [workers, ready, url, setUrl, urls, setUrls]);

    const removeUrlHandler = useCallback(async (idx: number)=>{
        if(!workers || !ready) throw new Error('workers not initialized');
        const updatedUrls = [...urls];
        updatedUrls.splice(idx, 1);

        const response = await workers.connection.setOllamaUrls(updatedUrls);
        if(response.ok !== true) throw new Error("Error setting urls: " + response.err);

        setUrls(updatedUrls);
    }, [workers, ready, urls, setUrls]);

    useEffect(()=>{
        if(!workers || !ready) return;
        workers.connection.getConfiguration()
            .then(response=>{
                // console.debug("AI Configuration", response);
                const urls = response.ollama_urls?.urls || [];
                setUrls(urls);
            })
            .catch(err=>console.error("Error loading configuration", err));
    }, [workers, ready, setUrls]);

    return (
        <section className='pt-6'>
            <h2 className='text-lg font-bold'>Ollama urls</h2>
            <p>List of URLs to use for ollama instances. Note that using https implies using MilleGrilles client TLS authentication.</p>

            <div className='grid grid-cols-1 lg:grid-cols-2 pt-2'>
                <p className='col-span-2'>Add URL to list</p>
                <input type="text" value={url} onChange={urlOnChangeHandler} 
                    className='text-white bg-slate-500' />
                <div>
                    <ActionButton onClick={addUrlHandler} revertSuccessTimeout={2} disabled={!ready}
                        className='btn inline-block bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-center'>
                            Add URL
                    </ActionButton>
                </div>
            </div>


            <UrlList value={urls} removeItem={removeUrlHandler} />

        </section>
    );
}

type UrlListProps = {
    value: string[],
    removeItem: (idx: number)=>Promise<void>
}

function UrlList(props: UrlListProps) {

    const ready = useConnectionStore(state=>state.connectionAuthenticated);

    const {value, removeItem} = props;

    const removeHandler = useCallback(async (e: MouseEvent<HTMLButtonElement>) => {
        const value = e.currentTarget.value;
        await removeItem(Number.parseInt(value));
    }, [removeItem]);

    const mappedUrls = useMemo(()=>{
        return value.map((item, idx)=>{
            return (
                <React.Fragment key={item}>
                    <p>{item}</p>
                    <div>
                        <ActionButton onClick={removeHandler} value={''+idx} confirm={true} disabled={!ready}>Remove</ActionButton>
                    </div>
                </React.Fragment>
            )
        })
    }, [value, ready, removeHandler]);

    if(value.length === 0) return <p>No URLs are configured yet. Add one to the list (field above) to get started.</p>

    return (
        <>
            <h3 className='font-bold pt-4 pb-2'>List of urls</h3>
            <div className='grid grid-cols-2'>
                {mappedUrls}
            </div>
        </>
    )
}

function InstanceInformation() {

    const workers = useWorkers();
    const ready = useConnectionStore(state=>state.connectionAuthenticated);

    const [models, setModels] = useState(null as LanguageModelType[] | null);

    useEffect(()=>{
        if(!ready || !workers) return;
        workers.connection.getModels()
            .then(response=>{
                // console.debug("Models response: ", response);
                if(response.ok !== true) throw new Error("Error receiving models: " + response.err);

                const sortedModels = response.models;
                if(sortedModels) {
                    sortedModels?.sort((a,b)=>{
                        return a.name.localeCompare(b.name);
                    })
                    setModels(sortedModels);
                }
            })
            .catch(err=>console.error("Error loading models", err));
    }, [ready, workers, setModels]);

    return (
        <section>
            <h2 className='text-lg font-bold pt-4'>Instance information</h2>
            <div>
                {models?
                    models.map(item=>{
                        return (
                            <p key={item.name}>{item.name}</p>
                        )
                    })
                :
                    <></>
                }
            </div>
        </section>
    )
}

function Models() {

    const workers = useWorkers();
    const ready = useConnectionStore(state=>state.connectionAuthenticated);

    const [defaultModel, setDefaultModel] = useState('');
    const [chatContextLength, setChatContextLength] = useState(4096 as number | string);

    const [chatModel, setChatModel] = useState('');
    const [knowledgeModel, setKnowledgeModel] = useState('');
    const [visionModel, setVisionModel] = useState('');
    const [embeddingModel, setEmbeddingModel] = useState('');
    const [ragQueryModel, setRagQueryModel] = useState('');

    const [ragContextSize, setRagContextSize] = useState(4096 as number | string);
    const [ragDocumentSize, setRagDocumentSize] = useState(1000 as number | string);
    const [ragOverlapSize, setRagOverlapSize] = useState(250 as number | string);

    const [kiwixWikipediaEnSearch, setKiwixWikipediaEnSearch] = useState('');

    const defaultModelOnChange = useCallback((e: ChangeEvent<HTMLInputElement>)=>setDefaultModel(e.currentTarget.value), [setDefaultModel]);
    const chatContextLengthOnChange = useCallback((e: ChangeEvent<HTMLInputElement>)=>{
        const value = Number.parseInt(e.currentTarget.value);
        if(isNaN(value)) setChatContextLength('');
        else setChatContextLength(value);
    }, [setChatContextLength]);

    const chatModelOnChange = useCallback((e: ChangeEvent<HTMLInputElement>)=>setChatModel(e.currentTarget.value), [setChatModel]);
    const knowledgeModelOnChange = useCallback((e: ChangeEvent<HTMLInputElement>)=>setKnowledgeModel(e.currentTarget.value), [setKnowledgeModel]);
    const visionModelOnChange = useCallback((e: ChangeEvent<HTMLInputElement>)=>setVisionModel(e.currentTarget.value), [setVisionModel]);

    const embeddingModelOnChange = useCallback((e: ChangeEvent<HTMLInputElement>)=>setEmbeddingModel(e.currentTarget.value), [setEmbeddingModel]);
    const ragQueryModelOnChange = useCallback((e: ChangeEvent<HTMLInputElement>)=>setRagQueryModel(e.currentTarget.value), [setRagQueryModel]);
    const ragContextSizeOnChange = useCallback((e: ChangeEvent<HTMLInputElement>)=>{

    const value = Number.parseInt(e.currentTarget.value);
        if(isNaN(value)) setRagContextSize('');
        else setRagContextSize(value);
    }, [setRagContextSize]);
    const ragDocumentSizeOnChange = useCallback((e: ChangeEvent<HTMLInputElement>)=>{
        const value = Number.parseInt(e.currentTarget.value);
        if(isNaN(value)) setRagDocumentSize('');
        else setRagDocumentSize(value);
    }, [setRagDocumentSize]);
    const ragOverlapSizeOnChange = useCallback((e: ChangeEvent<HTMLInputElement>)=>{
        const value = Number.parseInt(e.currentTarget.value);
        if(isNaN(value)) setRagOverlapSize('');
        else setRagOverlapSize(value);
    }, [setRagOverlapSize]);

    const kiwixWikipediaEnSearchOnChange = useCallback((e: ChangeEvent<HTMLInputElement>)=>setKiwixWikipediaEnSearch(e.currentTarget.value), [setKiwixWikipediaEnSearch]);

    const applyHandler = useCallback(async () => {
        if(!workers || !ready) throw new Error('workers not initialized');

        // Save the default model and chat options
        const chatContextLengthVal = typeof(chatContextLength)==='number'?chatContextLength:null;
        // console.debug("Chat context: %O, %d", chatContextLength, chatContextLengthVal)
        const responseDefaults = await workers.connection.setAiDefaults(defaultModel?defaultModel:null, chatContextLengthVal);
        if(responseDefaults.ok !== true) throw new Error("Error saving defaults: " + responseDefaults.err);

        const ragContextSizeVal = typeof(ragContextSize)==='number'?ragContextSize:null;
        const ragDocumentSizeVal = typeof(ragDocumentSize)==='number'?ragDocumentSize:null;
        const ragOverlapSizeVal = typeof(ragOverlapSize)==='number'?ragOverlapSize:null;

        const responseModels = await workers.connection.setAiModels(
            chatModel?chatModel:null, 
            knowledgeModel?knowledgeModel:null, 
            embeddingModel?embeddingModel:null, 
            ragQueryModel?ragQueryModel:null, 
            visionModel?visionModel:null);
        if(responseModels.ok !== true) throw new Error('Error saving model parameters: ' + responseModels.err);

        const responseRag = await workers.connection.setAiRag(ragContextSizeVal, ragDocumentSizeVal, ragOverlapSizeVal);
        if(responseRag.ok !== true) throw new Error('Error saving RAG parameters: ' + responseRag.err);

        const urls = {kiwixWikipediaEnSearch};
        const responseUrls = await workers.connection.setAiUrls(urls);
        if(responseUrls.ok !== true) throw new Error('Error saving URLs: ' + responseRag.err);
    }, [workers, ready, defaultModel, chatContextLength, chatModel, knowledgeModel, embeddingModel, ragQueryModel, visionModel, 
        ragContextSize, ragDocumentSize, ragOverlapSize,
        kiwixWikipediaEnSearch]);

    useEffect(()=>{
        if(!workers || !ready) return;
        workers.connection.getConfiguration()
            .then(response=>{
                console.debug("AI Configuration", response);
                if(!response) throw new Error("Empty response");
                setDefaultModel(response.default?.model_name || '');
                setChatContextLength(response.default?.chat_context_length || 4096)

                setChatModel(response.models?.chat_model_name || '');
                setKnowledgeModel(response.models?.knowledge_model_name || '');
                setVisionModel(response.models?.vision_model_name || '');
                setEmbeddingModel(response.models?.embedding_model_name || '');
                setRagQueryModel(response.models?.rag_query_model_name || '');

                setRagContextSize(response.rag?.context_len || 4096);
                setRagDocumentSize(response.rag?.document_chunk_len || 1000);
                setRagOverlapSize(response.rag?.document_overlap_len || 250);

                // URLs
                setKiwixWikipediaEnSearch(response.urls?.urls?.kiwixWikipediaEnSearch || '')
            })
            .catch(err=>console.error("Error loading configuration", err));
    }, [workers, ready, setDefaultModel, setChatContextLength, setChatModel, setKnowledgeModel, setEmbeddingModel, setRagQueryModel, setVisionModel, setRagContextSize, 
        setRagDocumentSize, setRagOverlapSize,
        setKiwixWikipediaEnSearch]);

    return (
        <section className='pt-4'>
            <h2 className='text-lg font-bold'>LLM Models</h2>

            <p className='pb-6'>
                Model to put to the top of the list. Each instance of ollama can have a different list of models, 
                but this one will be deployed on all instances and offer the best performance for simple queries.
            </p>

            <div className='grid grid-cols-1 lg:grid-cols-4 gap-x-4 gap-y-1'>
                <label htmlFor="default-model">Default model</label>
                <input id='default-model' type="text" value={defaultModel} onChange={defaultModelOnChange}
                    className='text-white bg-slate-500' />

                <label htmlFor='rag-context'>Chat context length</label>
                <input id='rag-context' type="text" value={chatContextLength} onChange={chatContextLengthOnChange}
                    className='text-white bg-slate-500' />

                <h3 className='font-bold pt-6 pb-2 lg:col-span-4'>Custom models</h3>

                {/* Custom models */}

                <label htmlFor='rag-embedding'>Chat model</label>
                <input id='rag-embedding' type="text" value={chatModel} onChange={chatModelOnChange}
                    className='lg:col-span-3 text-white bg-slate-500' />

                <label htmlFor='rag-embedding'>Knowledge model</label>
                <input id='rag-embedding' type="text" value={knowledgeModel} onChange={knowledgeModelOnChange}
                    className='lg:col-span-3 text-white bg-slate-500' />

                <label htmlFor='rag-query'>Vision model</label>
                <input id='rag-query' type="text" value={visionModel} onChange={visionModelOnChange}
                    className='lg:col-span-3 text-white bg-slate-500' />

                <label htmlFor='rag-embedding'>Embedding model</label>
                <input id='rag-embedding' type="text" value={embeddingModel} onChange={embeddingModelOnChange}
                    className='lg:col-span-3 text-white bg-slate-500' />

                <label htmlFor='rag-query'>Resource Augmented Generation (RAG) query model</label>
                <input id='rag-query' type="text" value={ragQueryModel} onChange={ragQueryModelOnChange}
                    className='lg:col-span-3 text-white bg-slate-500' />

                {/* RAG elements */}
                
                <h3 className='font-bold pt-6 pb-2 lg:col-span-4'>Resource Augmented Generation (RAG) parameters</h3>

                <ul className='pb-6 lg:col-span-4'>
                    <li>Warning: Changing embedding model (above) or RAG parameters requires a reindexing of all documents (use Coup D'Oeil to trigger).</li>
                    <li>Model to use for RAG embedding (indexing). Leave empty to disable RAG.</li>
                    <li>Note: changing of RAG chunk and overlap sizes only affects future documents.</li>
                    <li>To apply to all, trigger reindexing in Coup D'Oeil.</li>
                </ul>

                <label htmlFor='rag-context'>RAG context size</label>
                <input id='rag-context' type="text" value={ragContextSize} onChange={ragContextSizeOnChange}
                    className='text-white bg-slate-500' />

                <label htmlFor='rag-context'>RAG chunk size</label>
                <input id='rag-context' type="text" value={ragDocumentSize} onChange={ragDocumentSizeOnChange}
                    className='text-white bg-slate-500' />

                <label htmlFor='rag-context'>RAG overlap size</label>
                <input id='rag-context' type="text" value={ragOverlapSize} onChange={ragOverlapSizeOnChange}
                    className='text-white bg-slate-500' />

                <h3 className='font-bold pt-6 pb-2 lg:col-span-4'>URL references</h3>

                <label htmlFor='rag-context'>KIWIX - Wikipedia english search</label>
                <input id='rag-context' type="text" value={kiwixWikipediaEnSearch} onChange={kiwixWikipediaEnSearchOnChange}
                    className='lg:col-span-3 text-white bg-slate-500' />

            </div>

            <div className='pt-2'>
                <ActionButton onClick={applyHandler} disabled={!ready} revertSuccessTimeout={3}
                    className='btn inline-block bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-center'>
                        Apply
                </ActionButton>
            </div>
        </section>
    );
}
