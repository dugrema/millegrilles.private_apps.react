import { Link, useNavigate, useParams } from "react-router-dom";
import useUserBrowsingStore, {
  filesIdbToBrowsing,
  TuuidsBrowsingStoreRow,
} from "./userBrowsingStore";
import {
  MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Collection2DirectoryStats,
  Collections2SharedContactsSharedCollection,
} from "../types/connection.types";
import useWorkers, { AppWorkers } from "../workers/workers";
import useConnectionStore from "../connectionStore";
import { ButtonBar } from "./BrowsingElements";
import FilelistPane, { FileListPaneOnClickRowType } from "./FilelistPane";
import { Modals } from "./Modals";

function SharedFileBrowsing() {
  let { contactId, tuuid } = useParams();
  let navigate = useNavigate();
  let navSectionRef = useRef(null);

  let userId = useUserBrowsingStore((state) => state.userId);
  let setSharedCollection = useUserBrowsingStore(
    (state) => state.setSharedCollection,
  );
  let sharedCollection = useUserBrowsingStore(
    (state) => state.sharedCollection,
  );
  let setSharedContact = useUserBrowsingStore(
    (state) => state.setSharedContact,
  );
  let sharedWithUser = useUserBrowsingStore((state) => state.sharedWithUser);
  let currentDirectory = useUserBrowsingStore(
    (state) => state.sharedCurrentDirectory,
  );

  // Selecting files
  let selection = useUserBrowsingStore((state) => state.selection);
  let setSelection = useUserBrowsingStore((state) => state.setSelection);
  let selectionMode = useUserBrowsingStore((state) => state.selectionMode);
  let setSelectionMode = useUserBrowsingStore(
    (state) => state.setSelectionMode,
  );
  let setSelectionPosition = useUserBrowsingStore(
    (state) => state.setSelectionPosition,
  );

  let cuuid = useMemo(() => {
    if (tuuid) return tuuid;
    return sharedCollection?.tuuid; // Root for this shared collection
  }, [tuuid, sharedCollection]);

  let files = useMemo(() => {
    if (!currentDirectory) return null;
    let filesValues = Object.values(currentDirectory);
    return filesValues;
  }, [currentDirectory]) as TuuidsBrowsingStoreRow[] | null;

  useEffect(() => {
    if (!sharedWithUser?.sharedCollections || !contactId) {
      setSharedCollection(null);
    } else {
      let sharedCollection = sharedWithUser.sharedCollections
        .filter((item) => item.contact_id === contactId)
        .pop();
      setSharedCollection(sharedCollection || null);
      if (sharedCollection && sharedWithUser?.users) {
        let sharedUserId = sharedCollection.user_id;
        let sharedContact = sharedWithUser.users
          .filter((item) => item.user_id === sharedUserId)
          .pop();
        setSharedContact(sharedContact || null);
      }
    }
  }, [sharedWithUser, contactId, setSharedCollection, setSharedContact]);

  let onClickRowHandler = useCallback(
    (
      e: MouseEvent<HTMLButtonElement | HTMLDivElement>,
      tuuid: string,
      typeNode: string,
      range: TuuidsBrowsingStoreRow[] | null,
    ) => {
      let ctrl = e?.ctrlKey || false;
      let shift = e?.shiftKey || false;
      let effectiveSelectionMode = selectionMode;
      if (!selectionMode && (ctrl || shift)) {
        // Toggle selection mode
        effectiveSelectionMode = true;
        setSelectionMode(true);
      }

      if (effectiveSelectionMode) {
        // Selection mode
        let selectionSet = new Set() as Set<string>;
        if (selection) selection.forEach((item) => selectionSet.add(item)); // Copy all existing selections to Set

        if (tuuid) {
          if (shift && range) {
            // Range action
            range.forEach((item) => selectionSet.add(item.tuuid));
          } else {
            // Individual action
            if (selectionSet.has(tuuid)) {
              selectionSet.delete(tuuid);
            } else {
              selectionSet.add(tuuid);
            }
          }

          // Save position for range selection
          setSelectionPosition(tuuid);

          // Copy set back to array, save.
          let updatedSelection = [] as string[];
          selectionSet.forEach((item) => updatedSelection.push(item));
          setSelection(updatedSelection);
        }
      } else {
        // Navigation mode
        if (typeNode === "Fichier") {
          navigate(`/apps/collections2/c/${contactId}/f/${tuuid}`);
        } else {
          navigate(`/apps/collections2/c/${contactId}/b/${tuuid}`);
        }
      }
    },
    [
      contactId,
      selectionMode,
      selection,
      setSelectionMode,
      navigate,
      setSelection,
      setSelectionPosition,
    ],
  ) as FileListPaneOnClickRowType;

  let onLoadHandler = useCallback(() => {
    if (cuuid && userId) {
      let currentPosition = sessionStorage.getItem(`${cuuid}_${userId}`);
      if (currentPosition) {
        let positionInt = Number.parseInt(currentPosition);
        // @ts-ignore
        navSectionRef.current.scroll({ top: positionInt });
      }
    }
  }, [cuuid, userId, navSectionRef]);

  let [positionChanged, setPositionChanged] = useState(false);
  let onScrollHandler = useCallback(
    (e: Event) => setPositionChanged(true),
    [setPositionChanged],
  );
  useEffect(() => {
    if (!positionChanged) return;
    let navRef = navSectionRef;
    let timeout = setTimeout(() => {
      //@ts-ignore
      let position = navRef.current.scrollTop;
      sessionStorage.setItem(`${cuuid}_${userId}`, "" + position);
      setPositionChanged(false);
    }, 750);
    return () => clearTimeout(timeout);
  }, [navSectionRef, cuuid, userId, positionChanged, setPositionChanged]);

  useEffect(() => {
    if (!navSectionRef.current) return;
    let navRef = navSectionRef.current;
    //@ts-ignore
    navRef.addEventListener("scroll", onScrollHandler);
    return () => {
      //@ts-ignore
      navRef.removeEventListener("scroll", onScrollHandler);
    };
  }, [onScrollHandler, navSectionRef]);

  return (
    <>
      <section className="fixed top-10 md:top-12">
        <Breadcrumb contactId={contactId} />
        <div className="pt-2 hidden md:block">
          <ButtonBar disableEdit={true} shared={true} />
        </div>
      </section>

      <section
        ref={navSectionRef}
        className="fixed top-20 md:top-36 left-0 right-0 px-2 bottom-10 overflow-y-auto w-full"
      >
        <FilelistPane files={files} onClickRow={onClickRowHandler} />
      </section>

      <DirectorySyncHandler tuuid={cuuid} onLoad={onLoadHandler} />
      <Modals shared={true} />
    </>
  );
}

export default SharedFileBrowsing;

type BreadcrumbProps = {
  contactId?: string;
};

export function Breadcrumb(props: BreadcrumbProps) {
  let { contactId } = props;

  let sharedContact = useUserBrowsingStore((state) => state.sharedContact);
  let breadcrumb = useUserBrowsingStore((state) => state.sharedBreadcrumb);
  let navigate = useNavigate();

  let onClickHandler = useCallback(
    (e: MouseEvent<HTMLLIElement | HTMLParagraphElement>) => {
      if (!contactId) throw new Error("Contact_id is null");
      let value = e.currentTarget.dataset.tuuid || null;
      navigate(`/apps/collections2/c/${contactId}/b/${value}`);
    },
    [navigate, contactId],
  );

  let breadcrumbMapped = useMemo(() => {
    if (!sharedContact?.nom_usager || !breadcrumb) return <></>;
    let lastIdx = breadcrumb.length - 1;
    return breadcrumb
      .filter((item) => item)
      .map((item, idx) => {
        if (idx === lastIdx) {
          return (
            <li
              key={item.tuuid}
              className="flex items-center pl-2 text-sm bg-slate-700 bg-opacity-50 font-bold pr-2"
            >
              {item.nom}
            </li>
          );
        } else {
          return (
            <li
              key={item.tuuid}
              className="flex cursor-pointer items-center pl-2 text-sm bg-slate-700 hover:bg-slate-600 active:bg-slate-500 bg-opacity-50 transition-colors duration-300"
            >
              <p onClick={onClickHandler} data-tuuid={item.tuuid}>
                {item.nom}
              </p>
              <span className="pointer-events-none ml-2 text-slate-800">/</span>
            </li>
          );
        }
      });
  }, [sharedContact, breadcrumb, onClickHandler]);

  if (!sharedContact) return <p className="text-sm">Loading...</p>; // Loading

  return (
    <nav aria-label="breadcrumb" className="w-max">
      <ol className="flex w-full flex-wrap items-center">
        <li className="flex cursor-pointer items-center pl-2 text-sm bg-slate-700 hover:bg-slate-600 active:bg-slate-500 bg-opacity-50 transition-colors duration-300">
          <Link to="/apps/collections2/c">Shares</Link>
          <span className="pointer-events-none ml-2 text-slate-300">&gt;</span>
        </li>
        <li className="flex cursor-pointer items-center pl-2 text-sm bg-slate-700 hover:bg-slate-600 active:bg-slate-500 bg-opacity-50 transition-colors duration-300">
          <Link to={`/apps/collections2/c/${sharedContact.user_id}`}>
            {sharedContact.nom_usager}
          </Link>
          <span className="pointer-events-none ml-2 text-slate-400 font-bold">
            &gt;
          </span>
        </li>
        {breadcrumbMapped}
      </ol>
    </nav>
  );
}

/**
 * Handles the sync of files in a directory.
 * @returns
 */
export function DirectorySyncHandler(props: {
  tuuid: string | null | undefined;
  onLoad?: () => void;
}) {
  let { tuuid, onLoad } = props;

  let workers = useWorkers();
  let username = useConnectionStore((state) => state.username);
  let ready = useConnectionStore((state) => state.connectionAuthenticated);
  let userId = useUserBrowsingStore((state) => state.userId);
  let updateCurrentDirectory = useUserBrowsingStore(
    (state) => state.updateSharedCurrentDirectory,
  );
  let setSharedCuuid = useUserBrowsingStore((state) => state.setSharedCuuid);
  let setBreadcrumb = useUserBrowsingStore(
    (state) => state.setSharedBreadcrumb,
  );
  let setDirectoryStatistics = useUserBrowsingStore(
    (state) => state.setSharedDirectoryStatistics,
  );
  // let deleteFilesDirectory = useUserBrowsingStore(state=>state.deleteFilesDirectory);

  let sharedCollection = useUserBrowsingStore(
    (state) => state.sharedCollection,
  );

  let updateCurrentDirectoryHandler = useCallback(
    (files: TuuidsBrowsingStoreRow[] | null) => {
      updateCurrentDirectory(files);
      if (onLoad) onLoad();
    },
    [onLoad, updateCurrentDirectory],
  );

  useEffect(() => {
    if (!workers || !ready || !userId || !sharedCollection || !tuuid) return;
    let tuuidValue = tuuid || null;

    // Signal to cancel sync
    let cancelled = false;
    let cancelledSignal = () => cancelled;
    let cancel = () => {
      cancelled = true;
    };

    // Change the current directory in the store.
    setSharedCuuid(tuuidValue);

    // Clear screen
    updateCurrentDirectory(null);

    // Register directory change listener
    //TODO

    synchronizeDirectory(
      workers,
      userId,
      username,
      sharedCollection,
      tuuidValue,
      cancelledSignal,
      updateCurrentDirectoryHandler,
      setBreadcrumb,
      setDirectoryStatistics,
    ).catch((err) => console.error("Error loading directory: %O", err));

    return () => {
      // This will stop the processing of events in flight for the previous directory (they will be ignored).
      cancel();

      // Unregister directory change listener
      //TODO
    };
  }, [
    workers,
    ready,
    userId,
    username,
    tuuid,
    sharedCollection,
    setSharedCuuid,
    setBreadcrumb,
    updateCurrentDirectoryHandler,
    updateCurrentDirectory,
    setDirectoryStatistics,
  ]);

  return <></>;
}

async function synchronizeDirectory(
  workers: AppWorkers,
  userId: string,
  username: string,
  sharedCollection: Collections2SharedContactsSharedCollection,
  tuuid: string | null,
  cancelledSignal: () => boolean,
  updateCurrentDirectory: (files: TuuidsBrowsingStoreRow[] | null) => void,
  setBreadcrumb: (dirs: TuuidsBrowsingStoreRow[] | null) => void,
  setDirectoryStatistics: (
    directoryStatistics: Collection2DirectoryStats[] | null,
  ) => void,
  // deleteFilesDirectory: (files: string[]) => void
) {
  // if(!workers) throw new Error("Workers not initialized");

  // Load folder from IDB (if known)
  let { directory, list, breadcrumb } = await workers.directory.loadDirectory(
    userId,
    tuuid,
  );
  if (list) {
    let storeFiles = filesIdbToBrowsing(list);
    updateCurrentDirectory(storeFiles);
  }
  if (breadcrumb) {
    // Trucate breadcrumb up to the shared collection tuuid
    let idxTruncate = breadcrumb
      .map((item) => item.tuuid)
      .indexOf(sharedCollection.tuuid);
    let truncatedBreadcrumb =
      idxTruncate > 0 ? breadcrumb.slice(idxTruncate) : breadcrumb;
    let breadcrumbBrowsing = filesIdbToBrowsing(truncatedBreadcrumb);
    setBreadcrumb(breadcrumbBrowsing);
  }
  let syncDate = directory?.lastCompleteSyncSec || null;

  // Sync folder from server
  let complete = false;
  let skip = 0;
  let lastCompleteSyncSec = null as number | null;
  while (!complete) {
    if (cancelledSignal())
      throw new Error(`Sync of ${tuuid} has been cancelled - 1`);
    let response = await workers.connection.syncDirectory(
      tuuid,
      skip,
      syncDate,
      { contactId: sharedCollection.contact_id },
    );

    if (skip === 0) {
      // Keep initial response time for complete sync date
      if (response.__original?.estampille) {
        // Get previous second to ensure we're getting all sub-second changes on future syncs.
        lastCompleteSyncSec = response.__original.estampille - 1;
      }
      // console.debug("Initial response batch: %O", response);
    }

    // console.debug("Directory loaded: %O", response);
    if (!response.ok) throw new Error(`Error during sync: ${response.err}`);
    complete = response.complete;

    if (response.stats) {
      // Update store information with new directory stats
      setDirectoryStatistics(response.stats);
    }

    if (response.deleted_tuuids) {
      console.debug("Delete files %O", response.deleted_tuuids);
      await workers.directory.deleteFiles(response.deleted_tuuids, userId);
      // deleteFilesDirectory(response.deleted_tuuids);
    }

    if (!tuuid) {
      setBreadcrumb(null);
    } else if (response.breadcrumb) {
      let breadcrumb = await workers.directory.processDirectoryChunk(
        workers.encryption,
        userId,
        response.breadcrumb,
        response.keys,
        { shared: true },
      );
      let currentDirIdb = breadcrumb
        .filter((item) => item.tuuid === tuuid)
        .pop();

      let storeFiles = filesIdbToBrowsing(breadcrumb);

      let breadcrumbByTuuid = {} as { [tuuid: string]: TuuidsBrowsingStoreRow };
      for (let dir of storeFiles) {
        breadcrumbByTuuid[dir.tuuid] = dir;
      }

      // Create breadcrumb in reverse order
      let orderedBreadcrumb = [breadcrumbByTuuid[tuuid]];
      if (currentDirIdb?.path_cuuids) {
        for (let cuuid of currentDirIdb.path_cuuids) {
          let dirValue = breadcrumbByTuuid[cuuid];
          orderedBreadcrumb.push(dirValue);
        }
      }
      // Put breadcrumb in proper order
      orderedBreadcrumb = orderedBreadcrumb.reverse();

      // console.debug("breadcrumb: %O, StoreFiles: %O", breadcrumb, storeFiles);
      setBreadcrumb(orderedBreadcrumb);
    }

    if (response.files) {
      skip += response.files.length;

      // Process and save to IDB
      let files = await workers.directory.processDirectoryChunk(
        workers.encryption,
        userId,
        response.files,
        response.keys,
      );

      if (cancelledSignal())
        throw new Error(`Sync of ${tuuid} has been cancelled - 2`);
      // Save files in store
      let storeFiles = filesIdbToBrowsing(files);
      updateCurrentDirectory(storeFiles);
    } else if (response.keys) {
      console.warn("Keys received with no files");
    } else {
      complete = true;
    }
  }

  if (tuuid && lastCompleteSyncSec) {
    // Update current directory last sync information
    await workers.directory.touchDirectorySync(
      tuuid,
      userId,
      lastCompleteSyncSec,
    );
  }
}

// function Modals(props: {show: ModalEnum | null, close:()=>void}) {

//     let {show, close} = props;
//     let workers = useWorkers();
//     let ready = useConnectionStore(state=>state.connectionAuthenticated);

//     if(show === ModalEnum.Info) return <ModalInformation workers={workers} ready={ready} close={close} modalType={show} shared={true} />;
//     if(show === ModalEnum.Copy) return <ModalBrowseAction workers={workers} ready={ready} close={close} modalType={show} shared={true} title='Copy files' />;

//     return <></>;
// }
