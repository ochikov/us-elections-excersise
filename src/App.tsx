import * as React from 'react';
import styled from 'styled-components';

import Web3Modal from 'web3modal';
// @ts-ignore
import WalletConnectProvider from '@walletconnect/web3-provider';
import Column from './components/Column';
import Wrapper from './components/Wrapper';
import Header from './components/Header';
import Loader from './components/Loader';
import ConnectButton from './components/ConnectButton';

import { Web3Provider } from '@ethersproject/providers';
import { getChainData } from './helpers/utilities';
import { US_ELECTION_ADDRESS } from './constants';
import US_ELECTION from './abis/USElection.json';
import { getContract } from './helpers/ethers'; 
import Button from './components/Button';

enum President {
  BIDEN = 1,
  TRUMP = 2
}

const SLayout = styled.div`
  position: relative;
  width: 100%;
  min-height: 100vh;
  text-align: center;
`;

const SContent = styled(Wrapper)`
  width: 100%;
  height: 100%;
  padding: 0 16px;
`;

const LeaderWrapper = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  .elections {
    color: green;
    &.ended {
      color: red;
    }
  }
  div {
    margin-bottom: 10px;
    display: flex;
  }
  margin-bottom: 20px;
`

const TransactionInfoWrapper = styled(Wrapper)`
  width: 100%;
  height: auto;
  color: red;
`

const StateResultForm = styled.div`
  display: flex;
  flex-direction: column;
  div {
    margin-bottom: 10px;
    display: flex;
    justify-content: flex-end;
  }
`

const SomethingWentWrong = styled.div`
  color: red;
`

const SContainer = styled.div`
  height: 100%;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  word-break: break-word;
`;

const SLanding = styled(Column)`
  height: 600px;
`;

// @ts-ignore
const SBalances = styled(SLanding)`
  height: 100%;
  & h3 {
    padding-top: 30px;
  }
`;

interface IAppState {
  fetching: boolean;
  address: string;
  provider: any;
  library: any;
  connected: boolean;
  chainId: number;
  pendingRequest: boolean;
  result: any | null;
  electionContract: any | null;
  info: any | null;
  currentLeader: any | null;
  nameOfState: string | null;
  votesForBiden: number | null;
  votesForTrump: number | null;
  stateSeats: number | null;
  transactionHash: string | null;
  bidenSeats: number | null;
  trumpSeats: number | null;
  electionEnded: boolean;
  error: string | null;
}

const INITIAL_STATE: IAppState = {
  fetching: false,
  address: '',
  provider: null,
  library: null,
  connected: false,
  chainId: 1,
  pendingRequest: false,
  result: null,
  electionContract: null,
  info: null,
  currentLeader: null,
  nameOfState: null,
  votesForBiden: null,
  votesForTrump: null,
  stateSeats: null,
  transactionHash: null,
  bidenSeats: null,
  trumpSeats: null,
  electionEnded: false,
  error: null
};

class App extends React.Component<any, any> {
  // @ts-ignore
  public web3Modal: Web3Modal;
  public state: IAppState;

  constructor(props: any) {
    super(props);
    this.state = {
      ...INITIAL_STATE
    };

    this.web3Modal = new Web3Modal({
      network: this.getNetwork(),
      cacheProvider: true,
      providerOptions: this.getProviderOptions()
    });
  }

  public componentDidMount() {
    if (this.web3Modal.cachedProvider) {
      this.onConnect();
    }
  }

  public onConnect = async () => {
    const provider = await this.web3Modal.connect();

    const library = new Web3Provider(provider);
    const network = await library.getNetwork();
    await this.setState({ fetching: true });
    const address = provider.selectedAddress ? provider.selectedAddress : provider?.accounts[0];

    await this.subscribeToProviderEvents(provider);

    const electionContract = getContract(US_ELECTION_ADDRESS, US_ELECTION.abi, library, address);

    await this.setState({
      provider,
      library,
      chainId: network.chainId,
      address,
      connected: true,
      electionContract
    });

    await this.currentLeader();
    await this.getSeats();
    await this.getElectionStatus();
    await this.setState({ fetching: false });
  };

  public subscribeToProviderEvents = async (provider: any) => {
    if (!provider.on) {
      return;
    }
    provider.on("close", () => this.resetApp());
    provider.on("accountsChanged", async (accounts: string[]) => {
      await this.setState({ address: accounts[0] });
    });

    provider.on("networkChanged", async (networkId: number) => {
      const library = new Web3Provider(provider);
      const network = await library.getNetwork();
      const chainId = network.chainId;

      await this.setState({ chainId, library });
    });
  };

  public getNetwork = () => getChainData(this.state.chainId).network;

  public getProviderOptions = () => {
    const providerOptions = {
      walletconnect: {
        package: WalletConnectProvider,
        options: {
          infuraId: process.env.REACT_APP_INFURA_ID
        }
      }
    };
    return providerOptions;
  };

  public resetApp = async () => {
    await this.web3Modal.clearCachedProvider();
    this.setState({ ...INITIAL_STATE });
  };

  public currentLeader = async () => {
    const { electionContract } = this.state;

    const currentLeaderId = await electionContract.currentLeader();
    let currentLeader;

    switch (currentLeaderId) {
      case President.BIDEN:
        currentLeader = 'BIDEN'
        break;
      case President.TRUMP:
        currentLeader = 'TRUMP'
        break;
      default:
        currentLeader = 'NOBODY'
        break;
    }

    await this.setState({ currentLeader });
  };

  public submitElectionResult = async () => {
    try {
      const { electionContract } = this.state;

      const dataArr = [this.state.nameOfState, this.state.votesForBiden, this.state.votesForTrump, this.state.stateSeats];
      
      await this.setState({ fetching: true });
      const transaction = await electionContract.submitStateResult(dataArr);
  
      await this.setState({ transactionHash: transaction.hash });
      
      const transactionReceipt = await transaction.wait();
      if (transactionReceipt.status !== 1) {
        this.setState({error: transaction.error, fetching: false, transactionHash: null});
        return;
      }	
      await this.setState({ fetching: false, transactionHash: null, nameOfState: null, votesForBiden: null, votesForTrump: null, stateSeats: null });
      await this.currentLeader();
      await this.getSeats();
    } catch(error) {
      await this.setState({ fetching: false, error: error.message, transactionHash: null});
    }
  
};

public async getSeats() {
  const { electionContract } = this.state;
  const bidenSeats = await electionContract.seats(President.BIDEN);
  const trumpSeats = await electionContract.seats(President.TRUMP);
  this.setState({bidenSeats, trumpSeats});
}

public async getElectionStatus() {
  const { electionContract } = this.state;
  const electionEnded = await electionContract.electionEnded();
  this.setState({electionEnded})
}

public async endElection() {
  try {
    const { electionContract } = this.state;
    await this.setState({ fetching: true });
    const transaction = await electionContract.endElection();
    await this.setState({ transactionHash: transaction.hash });
    const transactionReceipt = await transaction.wait();
    if (transactionReceipt.status !== 1) {
      this.setState({error: transaction.error, fetching: false, transactionHash: null});
      return;
    }		
    await this.setState({ fetching: false, transactionHash: null });
    await this.currentLeader();
    await this.getSeats();
    await this.getElectionStatus();
  } catch (error) {
    await this.setState({ fetching: false, error: error.message, transactionHash: null});
  }


}

public async handleChange(event:any) {
  switch (event.target.name) {
    case 'name-of-state':
      await this.setState({nameOfState: event.target.value})
      break;
    case 'votes-biden':
      this.setState({votesForBiden: event.target.value})
      break;
    case 'votes-trump':
      this.setState({votesForTrump: event.target.value})
      break;
    case 'state-seats':
      this.setState({stateSeats: event.target.value})
      break;
    default:
      break;
  }
}

  public render = () => {
    const {
      address,
      connected,
      chainId,
      fetching
    } = this.state;
    return (
      <SLayout>
        <Column maxWidth={1000} spanHeight>
          <Header
            connected={connected}
            address={address}
            chainId={chainId}
            killSession={this.resetApp}
          />
          <SContent>
            {fetching ? (
              <Column center>
                <SContainer>
                  <Loader />
                  <TransactionInfoWrapper>
                  {this.state.transactionHash && <div>
                      {this.state.transactionHash}
                      <div>
                        <a href={`https://kovan.etherscan.io/tx/${this.state.transactionHash}`} >Link to Etherscan</a>
                      </div>
                    </div>}
                  </TransactionInfoWrapper>
                </SContainer>
              </Column>
            ) : (
                <SLanding center>
                  {!this.state.connected && <ConnectButton onClick={this.onConnect} />}
                  {this.state.connected && <LeaderWrapper>
                    <div className={this.state.electionEnded ? 'elections ended' : 'elections'}>Election Status: {this.state.electionEnded ? 'ENDED' : 'NOT ENDED'}</div>
                    <div>
                      The current leader is: {this.state.currentLeader}
                    </div>
                    <div>
                      Biden Seats: {this.state.bidenSeats}
                    </div>
                    <div>
                      Trump Seats: {this.state.trumpSeats}
                    </div>
                    <Button onClick={() => {this.endElection()}} disabled={this.state.electionEnded}>{this.state.electionEnded ? 'Elections are ended' : 'End the elections'}</Button>
                  </LeaderWrapper>}
                  <StateResultForm>
                    <div>
                      <label>
                        Name of State:
                      </label>
                      <input type="text" id='name-of-state' name="name-of-state" onChange={() => {this.handleChange(event)}} /> 
                    </div>
                    <div>
                      <label>
                          Votes for Biden:
                      </label>
                      <input type="number" id='votes-biden' name="votes-biden" onChange={() => {this.handleChange(event)}}/>
                    </div>
                    <div>
                      <label>
                        Votes for Trump:
                      </label>
                      <input type="number" id='votes-trump' name="votes-trump" onChange={() => {this.handleChange(event)}} />
                    </div>
                    <div>
                      <label>
                        State seats:
                      </label>
                      <input type="number" id='state-seats' name="state-seats" onChange={() => {this.handleChange(event)}}/>
                    </div>      
                        <Button onClick={this.submitElectionResult} disabled={this.state.electionEnded}>{this.state.electionEnded ? 'You cannot submit data' : 'Submit'}</Button>
                  </StateResultForm>
                  {this.state.error && <SomethingWentWrong>
                    {this.state.error}
                  </SomethingWentWrong>}
                </SLanding>
              )}
          </SContent>
        </Column>
      </SLayout>
    );
  };
}

export default App;
