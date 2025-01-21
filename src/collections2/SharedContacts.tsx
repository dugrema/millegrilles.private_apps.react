import { ChangeEvent, MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import useWorkers from "../workers/workers";
import useConnectionStore from "../connectionStore";
import { Collection2ContactItem } from "../workers/connection.worker";
import ActionButton from "../resources/ActionButton";
import TrashIcon from '../resources/icons/trash-2-svgrepo-com.svg';

function SharedContacts() {
    return (
        <>
            <h2 className='text-xl font-bold'>Contacts</h2>
            <CurrentContactList />
        </>
    )
}

export default SharedContacts;

function CurrentContactList() {

    let workers = useWorkers();
    let ready = useConnectionStore(state=>state.connectionAuthenticated);
    let [username, setUsername] = useState('');
    let usernameOnChange = useCallback((e: ChangeEvent<HTMLInputElement>)=>setUsername(e.currentTarget.value), [setUsername]);
    let [contacts, setContacts] = useState(null as Collection2ContactItem[] | null);

    let addUserHandler = useCallback(async ()=>{
        if(!workers || !ready) throw new Error('workers not initialized');
        console.debug("Add user");
        let response = await workers.connection.addCollection2Contact(username);
        if(!response.ok) throw new Error('Error adding contact: ' + response.err);
        console.debug("Add contact response: ", response);
        let contactsCopy = [] as Collection2ContactItem[];
        if(contacts) contactsCopy = [...contacts];
        // Add new contact to list
        contactsCopy.push(response);
        setContacts(contactsCopy);
    }, [workers, ready, username, contacts, setContacts]);

    useEffect(()=>{
        if(!workers || !ready) return;
        workers.connection.getCollection2ContactList()
            .then(response=>setContacts(response.contacts))
            .catch(err=>console.error("Error loading contacts", err));
    }, [workers, ready]);

    let contactDeleteHandler = useCallback(async (e: MouseEvent<HTMLButtonElement>) => {
        if(!workers || !ready) return;
        
        let contactId = e.currentTarget.value;
        console.debug("Delete contactId ", contactId);

        let response = await workers.connection.deleteCollection2Contact(contactId);
        if(!response.ok) throw new Error('Error deleted share user: ' + response.err)
        
        // Done, remove from view
        if(contacts) {
            let updatedContacts = contacts.filter(item=>item.contact_id !== contactId);
            setContacts(updatedContacts);
        }

    }, [workers, ready, contacts, setContacts]);

    let contactElems = useMemo(()=>{
        if(!contacts) return [];
        let contactsCopy = [...contacts];
        contactsCopy.sort(sortContacts);
        return contactsCopy.map(item=><ContactRow key={item.contact_id} value={item} onDelete={contactDeleteHandler} />);
    }, [contacts, contactDeleteHandler]);

    return (
        <>
            <p className='pt-4'>Add users to share collections with here.</p>
            <div className='grid grid-cols-3'>
                <label>User name</label>
                <input type='text' value={username} onChange={usernameOnChange} className='text-black col-span-2'/>
            </div>
            <ActionButton onClick={addUserHandler} disabled={!ready} revertSuccessTimeout={2}>Add user</ActionButton>

            <p className='pt-6 pb-2'>Current contacts</p>
            {contactElems.length > 0?contactElems
            :
                <p>Your content is not shared.</p>
            }
        </>
    );
}

export function sortContacts(a: Collection2ContactItem, b: Collection2ContactItem) {
    if(a === b) return 0;
    if(a.nom_usager === b.nom_usager) return a.user_id.localeCompare(b.user_id);
    return a.nom_usager.localeCompare(b.nom_usager);
}

function ContactRow(props: {value: Collection2ContactItem, onDelete: (e: MouseEvent<HTMLButtonElement>)=>Promise<void>}) {

    let {value, onDelete} = props;
    let ready = useConnectionStore(state=>state.connectionAuthenticated);

    return (
        <div className="odd:bg-slate-500 even:bg-slate-400 hover:bg-violet-800 odd:bg-opacity-40 even:bg-opacity-40 text-sm select-none">
            <ActionButton onClick={onDelete} value={value.contact_id} revertSuccessTimeout={3} varwidth={16} confirm={true} disabled={!ready} >
                <img src={TrashIcon} alt="Remove user" className='w-6 inline' />
            </ActionButton>
            <span className='pl-2'>{value.nom_usager}</span>
        </div>
    )
}
