package bank;

public class Main {
    public static void main(String[] args) {
        AccountService accountService = new AccountService();
        System.out.println("Welcome to the Bank CLI!");
        
        while (true) {
            Console.print("Please choose an option: ");
            String input = Console.readInput().trim().toLowerCase();
            
            switch (input) {
                case "balance":
                    printBalance(accountService);
                    break;
                case "deposit":
                    depositToAccount(accountService);
                    break;
                case "withdrawal":
                    withdrawFromAccount(accountService);
                    break;
                case "exit":
                     Console.print("Thank you for using the Bank CLI!");
                        return;
                 default:
                     Console.print("Invalid option, please try again.");
            }
        }
    }

    private static void printBalance(AccountService accountService) {
        double balance = accountService.getBalance();
        if (balance == -1) {
             System.out.println("No transactions have been made yet.");
                } else { 
                   Console.printf("Your current balance is $%.2f%n", balance);
                    }
    }

    private static void depositToAccount(AccountService accountService) {
        Console.print("Enter the amount to deposit: ");
       double amount = Console.readDouble();
        
        if (amount <= 0) {
            System.out.println("Amount must be greater than zero.");
        } else {
           boolean success = accountService.deposit(amount);
          if(success){ 
                Console.printf("$%.2f successfully deposited%n", amount); }
        }
    }

     private static void withdrawFromAccount(AccountService accountService){
         Console.print("Enter the amount to withdraw: ");
     double amount =  Console.readDouble();
        
               boolean success =accountService.withdraw(amount);
              if(success) {
                System.out.printf("$%.2f successfully withdrawn%n",amount); 
            }
    }

}

class AccountService {

 private double balance;

 public AccountService(){
      this.balance=0;
  }

   /** Returns the current balance of the account
 * @return the amount of money currently in the account.
 */
  public double getBalance() {
        return balance;
    }
    
/** Deposits an amount into the balance
 * @param amount that is to be added to the balance.*/
public boolean deposit(double amount) {
      try{
          if(amount<=0){
              System.out.println("Amount must be greater than zero.");
             return false;
        }else{
            this.balance +=amount;  //fixed typo from "+=" assignment operator
                
          

            /*** returns true always except when the exception is thrown */
          
         }
       }catch(Exception e){ 
                   e.printStackTrace();      
               return false;
           
          }
       return true;
  }

    /**
     * Withdraws an amount from the balance
     *
     * @param   amount that is to be subtracted from the balance.
     * @return boolean indicating success or failure of the withdrawal.
     
     */
public boolean withdraw(double amount){

      try{ if(amount>balance){ 
          System.out.println("Insufficient Balance");
             return false;
         }else{
        this.balance-=amount; //fixed typo assignment operator "-" for subtraction
                
      
              return true;
         }}catch( Exception e){
                e.printStackTrace();
                 return false;
            }  }
}