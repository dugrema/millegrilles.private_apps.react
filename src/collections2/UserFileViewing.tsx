import { MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import useUserBrowsingStore from "./userBrowsingStore";
import { DirectorySyncHandler } from "./UserFileBrowsing";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FileImageData, loadTuuid, TuuidsIdbStoreRowType } from "./idb/collections2StoreIdb";
import useConnectionStore from "../connectionStore";
import useWorkers from "../workers/workers";

function UserFileViewing() {

    let {tuuid} = useParams();
    let navigate = useNavigate();

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
        console.warn("TODO - click breadcrumb tuuid ", tuuid);
        if(tuuid) {
            navigate('/apps/collections2/b/' + tuuid);
        } else {
            navigate('/apps/collections2/b');
        }
    }, [navigate]);

    useEffect(()=>{
        if(tuuid) {
            loadTuuid(tuuid)
                .then(file=>setFile(file))
                .catch(err=>console.error("Error loading file", err));
        } else {
            setFile(null);
        }
    }, [setFile, tuuid]);

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
        setBlobUrl(blobUrl);

        return () => {
            URL.revokeObjectURL(blobUrl);
        }
    }, [setBlobUrl, thumbnail]);

    useEffect(()=>{
        if(!workers || !ready || !file?.secretKey) return;

        // Load the full size image if available
        let images = file?.fileData?.images;
        console.debug("Images", images);
        if(images) {
            // Find image with greatest resolution
            let maxImage = Object.values(images).reduce((acc, item)=>{
                if(!acc.value?.resolution || acc.value?.resolution < item.resolution) return {resolution: item.resolution, value: item};
                return acc;
            }, {resolution: 0, value: null as FileImageData | null});
            console.debug("Max image", maxImage);
            if(maxImage.value) {
                let image = maxImage.value;
                // Download image
                let fuuid = image.hachage;
                let secretKey = file.secretKey;
                workers.directory.openFile(fuuid, secretKey, image)
                    .then(imageBlob=>{
                        console.debug("Full size image: ", imageBlob);
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
        <>
            <p>File name</p>
            <p>{file.decryptedMetadata?.nom}</p>
        </>
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
