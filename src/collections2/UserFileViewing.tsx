import { MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import useUserBrowsingStore, { filesIdbToBrowsing } from "./userBrowsingStore";
import { DirectorySyncHandler } from "./UserFileBrowsing";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FileImageData, loadTuuid, TuuidsIdbStoreRowType } from "./idb/collections2StoreIdb";
import useConnectionStore from "../connectionStore";
import useWorkers from "../workers/workers";
import { Formatters } from "millegrilles.reactdeps.typescript";

function UserFileViewing() {

    let {tuuid} = useParams();
    let navigate = useNavigate();
    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.filehostAuthenticated);
    let userId = useUserBrowsingStore(state=>state.userId);

    let [file, setFile] = useState(null as TuuidsIdbStoreRowType | null);
    let cuuid = useMemo(()=>{
        if(!file) return null;
        return file.parent;
    }, [file]) as string | null;

    let thumbnailBlob = useMemo(()=>{
        if(!file) return null;
        return file.thumbnail;
    }, [file]) as Blob | null;

    let breacrumbOnClick = useCallback((tuuid: string | null)=>{
        if(tuuid) {
            navigate('/apps/collections2/b/' + tuuid);
        } else {
            navigate('/apps/collections2/b');
        }
    }, [navigate]);

    useEffect(()=>{
        if(tuuid) {
            loadTuuid(tuuid)
                .then(file=>{
                    setFile(file);
                })
                .catch(err=>console.error("Error loading file", err));
        } else {
            setFile(null);
        }
    }, [setFile, tuuid]);

    useEffect(()=>{
        if(!workers || !ready || !userId || !tuuid) return;
        workers.connection.getFilesByTuuid([tuuid])
            .then(async response => {
                if(!workers) throw new Error('workers not initialzed');
                if(!userId) throw new Error('User id is null');
                
                if(response.ok === false) {
                    throw new Error('Error loading file: ' + response.err);
                }
                if(response.files?.length === 1 && response.keys?.length === 1) {
                    let files = await workers.directory.processDirectoryChunk(workers.encryption, userId, response.files, response.keys);
                    // Update file on screen
                    if(files.length === 1) {
                        setFile(files[0])
                    }
                } else {
                    console.warn("Error loading file, mising content or key for tuuid", tuuid);
                }
            })
            .catch(err=>console.error("Error loading file %s: %O", tuuid, err));
    }, [workers, ready, tuuid, userId]);

    return (
        <>
            <Breadcrumb onClick={breacrumbOnClick} file={file} />

            <section>
                {
                    thumbnailBlob?
                    <FileMediaLayout file={file} thumbnail={thumbnailBlob} />
                    :
                    <FileViewLayout file={file} />
                }
            </section>
            
            <DirectorySyncHandler tuuid={cuuid} />
        </>
    )
    
}

export default UserFileViewing;

function FileMediaLayout(props: {file: TuuidsIdbStoreRowType | null, thumbnail: Blob | null}) {

    let {file, thumbnail} = props;
    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.filehostAuthenticated);

    let [blobUrl, setBlobUrl] = useState('');
    let [fullSizeBlobUrl, setFullSizeBlobUrl] = useState('');

    // Load blob URL
    useEffect(()=>{
        if(!thumbnail) return;
        let blobUrl = URL.createObjectURL(thumbnail);
        // Introduce delay to allow full size to load first when possible (avoids flickering).
        setTimeout(()=>setBlobUrl(blobUrl), 500);

        return () => {
            URL.revokeObjectURL(blobUrl);
        }
    }, [setBlobUrl, thumbnail]);

    // Load full size image when applicable
    useEffect(()=>{
        if(!workers || !ready || !file?.secretKey) return;

        // Load the full size image if available
        let images = file?.fileData?.images;
        if(images) {
            // Find image with greatest resolution
            let maxImage = Object.values(images).reduce((acc, item)=>{
                if(!acc?.resolution || acc?.resolution < item.resolution) return item;
                return acc;
            }, null as FileImageData | null);
            if(maxImage) {
                // Download image
                let fuuid = maxImage.hachage;
                let secretKey = file.secretKey;
                workers.directory.openFile(fuuid, secretKey, maxImage)
                    .then(imageBlob=>{
                        let imageBlobUrl = URL.createObjectURL(imageBlob);
                        setFullSizeBlobUrl(imageBlobUrl);
                    })
                    .catch(err=>console.error("Error loading full size image", err));
            }
        }
    }, [workers, ready, file, setFullSizeBlobUrl]);
    
    // Cleanup full size blob
    useEffect(()=>{
        if(!fullSizeBlobUrl) return;
        return () => {
            URL.revokeObjectURL(fullSizeBlobUrl);
        }
    }, [fullSizeBlobUrl]);

    if(!file) return <></>;

    return (
        <div className='grid grid-cols-3 pt-2'>
            <div className='flex grow col-span-2 pr-4 max-h-screen pb-32'>
                <img src={fullSizeBlobUrl || blobUrl} alt='Content of the file' className='grow object-contain object-right' />
            </div>
            <div>
                <FileDetail file={file} />
            </div>
        </div>
    )
}

function FileViewLayout(props: {file: TuuidsIdbStoreRowType | null}) {

    let {file} = props;

    if(!file) return <></>;

    return (
        <div className='pt-2'>
            <FileDetail file={file} />
        </div>
    )
}

function FileDetail(props: {file: TuuidsIdbStoreRowType}) {
    let {file} = props;
    
    return (
        <div className='grid-cols-1'>
            <p className='text-slate-400'>File name</p>
            <p>{file.decryptedMetadata?.nom}</p>
            <p className='text-slate-400'>File size</p>
            <p><Formatters.FormatteurTaille value={file.fileData?.taille} /></p>
            <p className='text-slate-400'>File date</p>
            <p><Formatters.FormatterDate value={file.decryptedMetadata?.dateFichier || file.date_creation} /></p>
            <p className='text-slate-400'>Type</p>
            <p>{file.fileData?.mimetype}</p>
            <ImageDimensions file={file} />
            <VideoDuration file={file} />
        </div>
    )
}

type BreadcrumbProps = {
    onClick?: (tuuid: string | null) => void,
    file: TuuidsIdbStoreRowType | null,
}

function Breadcrumb(props: BreadcrumbProps) {

    let { onClick, file } = props;

    let username = useConnectionStore(state=>state.username);
    let breadcrumb = useUserBrowsingStore(state=>state.breadcrumb);

    let onClickHandler = useCallback((e: MouseEvent<HTMLLIElement | HTMLParagraphElement>)=>{
        if(!onClick) return;
        let value = e.currentTarget.dataset.tuuid || null;
        onClick(value);
    }, [onClick])

    let breadcrumbMapped = useMemo(()=>{
        if(!file || !breadcrumb) return null;
        let breadcrumbMapped = [];
        breadcrumbMapped = breadcrumb;

        let mappedDirectories = breadcrumbMapped.map(item=>{
            return (
                <li key={item.tuuid} className='flex cursor-pointer items-center pl-2 text-sm bg-slate-700 hover:bg-slate-600 active:bg-slate-500 bg-opacity-50 transition-colors duration-300'>
                    {onClick?
                        <p onClick={onClickHandler} data-tuuid={item.tuuid}>{item.nom}</p>
                    :
                        <Link to={'/apps/collections2/b/' + item.tuuid}>{item.nom}</Link>
                    }
                    
                    <span className="pointer-events-none ml-2 text-slate-800">/</span>
                </li>
            )
        });

        let rootUser = (
            <li key='root' className='flex items-center pl-2 text-sm bg-slate-700 bg-opacity-50'>
                <Link to={'/apps/collections2/b/root'}>{username}</Link>
                <span className="pointer-events-none ml-2 text-slate-400 font-bold">&gt;</span>
            </li>
        )

        let fileElem =(
            <li key={file.tuuid} className='flex items-center pl-2 text-sm bg-slate-700 bg-opacity-50 font-bold pr-2'>
                {file.decryptedMetadata?.nom}
            </li>
        );

        return [rootUser, ...mappedDirectories, fileElem];
    }, [username, file, breadcrumb, onClick, onClickHandler]);

    if(!breadcrumbMapped) return <p>Loading ...</p>;

    return (
        <nav aria-label='breadcrumb' className='w-max'>
            <ol className='flex w-full flex-wrap items-center'>
                {breadcrumbMapped}
            </ol>
        </nav>
    );
}

function ImageDimensions(props: {file: TuuidsIdbStoreRowType | null}) {
    let {file} = props;
    if(!file?.fileData?.height || !file?.fileData?.width) return <></>;
    return (
        <>
            <p className='text-slate-400'>Dimension</p>
            <p>{file.fileData.width} x {file.fileData.height}</p>
        </>
    )
}

function VideoDuration(props: {file: TuuidsIdbStoreRowType | null}) {
    let {file} = props;
    if(!file?.fileData?.duration) return <></>;
    return (
        <>
            <p className='text-slate-400'>Duration</p>
            <Formatters.FormatterDuree value={file.fileData.duration} />
        </>
    )
}
